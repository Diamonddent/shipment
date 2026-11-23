import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TABLET_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { MobileTabBar, Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dd-sidebar') === 'collapsed');
  const [tabletOpen, setTabletOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const tablet = useMediaQuery(TABLET_QUERY);
  const { pathname } = useLocation();
  // any navigation (links, back/forward) closes the phone drawer
  useEffect(() => setMobileOpen(false), [pathname]);
  // Tablets default to the icon rail; desktops keep the saved preference.
  const rail = tablet ? !tabletOpen : collapsed;
  const toggle = () => {
    if (tablet) {
      setTabletOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      localStorage.setItem('dd-sidebar', c ? 'open' : 'collapsed');
      return !c;
    });
  };
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={rail} onToggle={toggle} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={cn('flex min-h-screen min-w-0 flex-col transition-[padding] duration-300 ease-out', rail ? 'md:pl-[88px]' : 'md:pl-[268px]')}>
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-3 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 sm:px-5 md:pb-8 md:pr-6 md:pt-6 lg:pr-8">
          <Outlet />
        </main>
      </div>
      <MobileTabBar onMore={() => setMobileOpen(true)} moreOpen={mobileOpen} />
    </div>
  );
}
