import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function sampleStudio(page: Page) {
  await page.goto('./');
  await page.getByText('Explore a sample studio').click();
  await page.getByRole('button', { name: 'Open sample studio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
}

test('first run: start fresh', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Studio name').fill('Test Studio');
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Create my studio' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ada');
  await expect(page.getByText('All clear for today')).toBeVisible();
});

test('v1 data already in this browser imports in one step', async ({ page }) => {
  const v1 = readFileSync(new URL('../tests/legacy-v1.json', import.meta.url), 'utf8');
  await page.addInitScript((data) => { if (!localStorage.getItem('chakra-studio-os-v2')) localStorage.setItem('chakra-studio-os-v1', data); }, v1);
  await page.goto('./');
  await expect(page.getByText('Your v1 studio is in this browser')).toBeVisible();
  await page.getByRole('button', { name: 'Import my v1 data' }).click();
  await page.goto('./#/work?pview=list&pfilter=all');
  await expect(page.getByText('Historical project').filter({ visible: true }).first()).toBeVisible();
});

test('daily check-in: complete a task, then undo', async ({ page }) => {
  await sampleStudio(page);
  const row = page.getByRole('button', { name: /Refine logo lockups/ }).first();
  await row.getByRole('checkbox').click();
  await expect(page.getByText('Completed “Refine logo lockups”')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Refine logo lockups' })).toBeVisible();
});

test('quick capture parses project, date and priority', async ({ page, isMobile }) => {
  await sampleStudio(page);
  if (isMobile) await page.getByRole('button', { name: 'New task' }).last().click();
  else await page.keyboard.press('n');
  await page.getByLabel('Task', { exact: true }).fill('Print proofs for Lumi tomorrow high');
  await expect(page.getByText('Lumi website').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.goto('./#/work/tasks?tscope=all&tview=list');
  const row = page.getByRole('button', { name: /Complete Print proofs/ }).locator('..');
  await expect(row).toContainText('Lumi website');
  await expect(row).toContainText('Tomorrow');
});

test('invoice to cash: record payment marks it paid and adds income', async ({ page }) => {
  await sampleStudio(page);
  await page.goto('./#/money/invoices');
  await page.getByRole('link', { name: /INV-\d{4}-002/ }).click();
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await page.goto('./#/money/expenses');
  await expect(page.getByText(/INV-\d{4}-002 · Lumi Co\./)).toBeVisible();
});

test('invoice and report download as PDF files', async ({ page }) => {
  await sampleStudio(page);
  await page.goto('./#/money/invoices');
  await page.getByRole('link', { name: /INV-\d{4}-002/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^INV-\d{4}-002 - Lumi Co\.\.pdf$|^INV-\d{4}-002 - Lumi Co\.pdf$/);
  await page.goto('./#/money/reports');
  const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()]);
  expect(report.suggestedFilename()).toMatch(/report .*\.pdf$/);
});

test('client portal shows milestones but no money', async ({ page, context }) => {
  await sampleStudio(page);
  await page.goto('./#/clients');
  await page.getByRole('button', { name: /Nova Labs/ }).click();
  await page.getByRole('button', { name: 'Create portal link' }).click();
  const url = await page.getByLabel('Portal link').inputValue();
  await page.waitForTimeout(400); // local mode saves are debounced
  const portal = await context.newPage();
  await portal.goto(url);
  await expect(portal.getByText('Project updates for Nova Labs')).toBeVisible();
  await expect(portal.getByText('Final identity approved')).toBeVisible();
  await expect(portal.getByText(/INV-|\$/)).toHaveCount(0);
});

test('every screen renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await sampleStudio(page);
  for (const r of ['work', 'work/tasks', 'clients', 'money', 'money/invoices', 'money/expenses', 'money/subscriptions', 'money/reports', 'settings', 'settings/team', 'settings/templates', 'settings/notifications', 'settings/data']) {
    await page.goto(`./#/${r}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
