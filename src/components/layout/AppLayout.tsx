import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dd-sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem('dd-sidebar', c ? 'open' : 'collapsed');
      return !c;
    });
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={cn('flex min-h-screen flex-col transition-all duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-64')}>
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
