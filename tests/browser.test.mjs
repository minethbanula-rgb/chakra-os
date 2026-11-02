// Run against the dev server, or set BASE_URL to the standalone/public URL.
// Requires Playwright and an installed Chromium browser.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=process.env.CDP_URL?await chromium.connectOverCDP(process.env.CDP_URL):await chromium.launch();
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173/';const out=process.env.SCREENSHOT_DIR||'test-results';mkdirSync(out,{recursive:true});
await page.goto(base);await page.locator('#page').waitFor();
for(const width of [360,390,768,1024,1440,1920]){
 await page.setViewportSize({width,height:1000});
 for(const screen of ['home','projects','tasks','clients','finance','subscriptions','bills','insights','users','settings','invoice']){
  await page.evaluate(p=>{location.hash=p},screen);await page.waitForFunction(p=>location.hash==='#'+p,screen);await page.waitForTimeout(250);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${screen} overflow at ${width}`);
 }
}
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'#home');await page.locator('h1').waitFor();await page.waitForTimeout(350);assert.equal(await page.locator('#page').evaluate(el=>getComputedStyle(el).opacity),'1');await page.screenshot({path:out+'/home-desktop.png',fullPage:true});
await page.goto(base+'#projects');await page.locator('[data-view="projects:Cards"]').click();await page.waitForTimeout(350);await page.screenshot({path:out+'/projects-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:900});await page.goto(base+'#home');await page.locator('[data-action="menu"]').click();assert.equal(await page.locator('[data-action="menu"]').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');await page.waitForTimeout(350);assert.ok(await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right<=0));await page.screenshot({path:out+'/home-mobile.png',fullPage:true});
for(const mode of ['Reduced','Off']){await page.evaluate(mode=>{db.settings.motion=mode;page='home';render()},mode);assert.equal(await page.locator('h1').isVisible(),true);}
// Exercise the delivery controls in a real browser without touching cloud business data.
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'#projects');await page.locator('[data-view="projects:Board"]').click();
await page.evaluate(()=>{window.projectDragTrace=[];for(const name of ['dragstart','dragover','drop'])document.addEventListener(name,e=>{if(window.projectDragTrace.length<30)window.projectDragTrace.push({name,types:[...e.dataTransfer.types],target:e.target.closest('[data-project-drop]')?.dataset.projectDrop})},true)});
await page.locator('[data-drag-project="p0"] .project-drag-handle').dragTo(page.locator('[data-project-drop="In Review"]'),{targetPosition:{x:12,y:12}});
try{await page.waitForFunction(()=>db.projects.find(p=>p.id==='p0').status==='In Review',null,{timeout:5000})}catch(error){console.log('Project drag trace:',await page.evaluate(()=>window.projectDragTrace));await page.screenshot({path:out+'/project-drag-failure.png',fullPage:true});throw error}
await page.locator('[data-add="projects"]').click();await page.locator('[name=name]').fill('Delivery QA project');await page.locator('[name=client]').selectOption('Nova Labs');await page.locator('#add-milestone').click();await page.locator('[data-milestone-title]').fill('Design approval');await page.locator('[data-milestone-date]').fill('2026-11-20');await page.locator('[data-milestone-state]').selectOption('In Progress');await page.locator('[name=driveUrl]').fill('https://drive.google.com/drive/folders/qa-fixture');await page.locator('#record-form button[type=submit]').click();
assert.equal(await page.evaluate(()=>db.projects[0].milestones[0].title),'Design approval');
await page.goto(base+'#tasks');await page.locator('[data-add=tasks]').first().click();assert.equal(await page.locator('[name=assignee]').evaluate(el=>el.tagName),'SELECT');await page.locator('[data-close]').click();
await page.goto(base+'#clients');await page.locator('[data-add=clients]').click();await page.locator('[name=name]').fill('Client with optional contacts');await page.locator('[name=contact]').fill('');await page.locator('[name=email]').fill('');await page.locator('#record-form button[type=submit]').click();assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);
await page.goto(base+'#settings');await page.locator('[data-settings-tab="Workspace"]').click();await page.locator('[name=cycleStartDay]').selectOption('25');await page.locator('#settings-form button[type=submit]').click();assert.equal(await page.evaluate(()=>cycleDay()),25);await page.waitForTimeout(250);await page.screenshot({path:out+'/monthly-cycle.png',fullPage:true});
await page.goto(base+'#invoice');assert.equal(await page.locator('[data-invoice=client]').evaluate(el=>el.tagName),'SELECT');await page.locator('[data-advance-percent]').fill('25');const expected=await page.evaluate(()=>(totalInvoice(invoice)*.25).toFixed(2));assert.equal(await page.locator('[data-advance-amount]').inputValue(),expected);await page.locator('[data-advance-amount]').fill('123');await page.locator('[data-action=save-invoice]').click();await page.waitForTimeout(250);await page.screenshot({path:out+'/invoice-advance.png',fullPage:true});
const shareFixture={settings:{studio:'Delivery QA studio',accent:'#7362d8'},client:{name:'Sample client'},projects:[{name:'Website delivery',status:'In Review',due:'2026-11-30',driveUrl:'https://drive.google.com/drive/folders/qa-fixture',milestones:[{title:'Discovery',date:'2026-11-03',state:'Complete'},{title:'Design approval',date:'2026-11-20',state:'In Progress'},{title:'Launch',date:'2026-11-30',state:'Planned'}]}]};
await page.route('**/rest/v1/rpc/chakra_shared_portal',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(shareFixture)}));
const shareRequests=[];page.on('request',request=>{if(request.url().includes('/rest/v1/'))shareRequests.push(request.url())});await page.goto(base+'#share='+'a'.repeat(64));await page.locator('.milestone-timeline').waitFor();assert.equal(await page.locator('#portal-account').count(),0);assert.equal(shareRequests.some(url=>url.includes('chakra_workspace')),false);assert.equal(await page.locator('#toast').textContent(),'');await page.waitForTimeout(250);await page.screenshot({path:out+'/client-delivery-portal-fixture.png',fullPage:true});
await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/client-delivery-portal-mobile-fixture.png',fullPage:true});
await page.goto(base+'#invoice');await page.emulateMedia({media:'print'});assert.equal(await page.locator('.template-toolbar').isVisible(),false);assert.equal(await page.locator('.paper').isVisible(),true);await page.pdf({path:out+'/invoice.pdf',format:'A4'});
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: widths, screen navigation, motion, keyboard drawer and print.');
