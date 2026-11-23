import * as React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from '@/data/store';
import { useCanSeeMoney } from '@/data/hooks';
import { Toaster } from '@/components/ui';
import { Shell, useApplyTheme } from './Shell';
import { Today } from '@/features/today/Today';
import { Projects, AllTasks } from '@/features/work/Work';
import { ProjectPage } from '@/features/work/ProjectPage';
import { Clients, ClientPage } from '@/features/clients/Clients';
import { MoneyOverview, Invoices, Expenses, Subscriptions, Reports } from '@/features/money/Money';
import { InvoicePage } from '@/features/money/InvoicePage';
import { Settings } from '@/features/settings/Settings';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Portal } from '@/features/portal/Portal';
import { useOverdueNudge } from './nudge';

function Money({ children }: { children: React.ReactNode }) {
  return useCanSeeMoney() ? <>{children}</> : <Navigate to="/" replace />;
}

function Studio() {
  useApplyTheme();
  useOverdueNudge();
  const onboarded = useStore((s) => s.workspace.onboarded);
  if (!onboarded) return <Onboarding />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Today />} />
        <Route path="work" element={<Projects />} />
        <Route path="work/tasks" element={<AllTasks />} />
        <Route path="work/p/:id" element={<ProjectPage />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientPage />} />
        <Route path="money" element={<Money><MoneyOverview /></Money>} />
        <Route path="money/invoices" element={<Money><Invoices /></Money>} />
        <Route path="money/invoices/:id" element={<Money><InvoicePage /></Money>} />
        <Route path="money/expenses" element={<Money><Expenses /></Money>} />
        <Route path="money/subscriptions" element={<Money><Subscriptions /></Money>} />
        <Route path="money/reports" element={<Money><Reports /></Money>} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/:tab" element={<Settings />} />
        {/* v1 links */}
        <Route path="projects" element={<Navigate to="/work" replace />} />
        <Route path="tasks" element={<Navigate to="/work/tasks" replace />} />
        <Route path="finance" element={<Navigate to="/money" replace />} />
        <Route path="bills" element={<Navigate to="/money/invoices" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/p/:token" element={<Portal />} />
        <Route path="*" element={<Studio />} />
      </Routes>
      <Toaster />
    </HashRouter>
  );
}
