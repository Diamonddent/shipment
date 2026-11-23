import { NavLink } from 'react-router-dom';
import {
  BarChart3, ChevronsLeft, ChevronsRight, FileText, FolderOpen, LayoutDashboard, Menu, PackagePlus,
  Receipt, Settings, Ship, Truck, Building2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_TITLE, COMPANY_NAME } from '@/lib/constants';
import { usePermissions } from '@/hooks/useAuth';
import { useNavHighlight } from './useNavHighlight';

const groups = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Shipments',
    items: [
      { to: '/shipments', label: 'Shipment Register', icon: Ship, end: true },
      { to: '/shipments/new', label: 'New Shipment', icon: PackagePlus },
      { to: '/expenses', label: 'Expenses', icon: Receipt },
      { to: '/documents', label: 'Documents', icon: FolderOpen },
    ],
  },
  {
    label: 'Partners',
    items: [
      { to: '/suppliers', label: 'Suppliers', icon: Building2 },
      { to: '/forwarders', label: 'Freight Forwarders', icon: Truck },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function Logo() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3557d4] bg-gradient-to-br from-[#3557d4] to-[#6b3fd1] shadow-lg">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M6 3h12l4 6-10 12L2 9z" />
        <path d="M2 9h20M12 21 8 9l4-6 4 6z" />
      </svg>
    </div>
  );
}

/**
 * `collapsed` = icon rail at md+ (tablet rail / desktop collapsed). Below md the sidebar is a
 * slide-in drawer (opened from the bottom tab bar's "More" or the topbar menu button).
 */
export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { isAdmin, isManager } = usePermissions();
  const { ref, box } = useNavHighlight<HTMLDivElement>([collapsed, mobileOpen]);
  return (
    <>
      {mobileOpen && <div className="animate-fade fixed inset-0 z-[45] bg-[#06122a]/55 md:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          'glass fixed z-50 flex flex-col text-slate-700 transition-[transform,width] duration-300 ease-out dark:text-slate-300',
          // phone drawer
          'inset-y-0 left-0 w-72 max-w-[85vw] rounded-r-3xl pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-[110%]',
          // tablet / desktop floating glass rail
          'md:bottom-3 md:left-3 md:top-3 md:max-w-none md:translate-x-0 md:rounded-3xl md:pb-0 md:pt-0',
          collapsed ? 'md:w-[76px]' : 'md:w-64',
        )}
      >
        <div className={cn('flex min-h-[68px] items-center gap-3 border-b border-line px-4 py-2 dark:border-white/10', collapsed && 'md:justify-center md:px-0')}>
          <Logo />
          <div className={cn('min-w-0', collapsed && 'md:hidden')}>
            <p className="text-[12px] font-bold leading-tight tracking-wide text-slate-900 dark:text-white">{COMPANY_NAME}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{APP_TITLE}</p>
          </div>
          <button onClick={onCloseMobile} className="lg-press ml-auto rounded-xl p-2 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white md:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Main">
          <div ref={ref} className="relative">
            {box && (
              <span className="lg-nav-hl" aria-hidden="true" style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }} />
            )}
            {groups.map((g) => (
              <div key={g.label} className="mb-5">
                <p className={cn('mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400', collapsed && 'md:hidden')}>{g.label}</p>
                <ul className="space-y-0.5">
                  {g.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onCloseMobile}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'lg-press relative z-[1] flex min-h-[44px] items-center gap-3 rounded-[14px] px-3 py-2 text-sm font-medium',
                            isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 hover:bg-white/40 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
                            collapsed && 'md:justify-center md:px-0',
                          )
                        }
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="border-t border-line p-3 dark:border-white/10">
          <div className={cn('mb-2 rounded-xl bg-white/40 px-3 py-2 text-[11px] text-slate-600 dark:bg-white/5 dark:text-slate-300', collapsed && 'md:hidden')}>
            <FileText className="mr-1 inline h-3.5 w-3.5" />
            {isAdmin ? 'Administrator access' : isManager ? 'Manager access' : 'Employee access'}
          </div>
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="lg-press hidden min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-600 hover:bg-white/40 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white md:flex"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>
    </>
  );
}

const tabItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/shipments', label: 'Shipments', icon: Ship, end: true },
  { to: '/shipments/new', label: 'New', icon: PackagePlus, end: false },
  { to: '/expenses', label: 'Expenses', icon: Receipt, end: false },
];

/** Phones only: bottom glass tab bar. "More" opens the full navigation drawer. */
export function MobileTabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { ref, box } = useNavHighlight<HTMLDivElement>([moreOpen]);
  return (
    <nav
      aria-label="Quick navigation"
      className="glass fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-40 rounded-3xl p-1.5 md:hidden"
    >
      <div ref={ref} className="relative flex gap-1">
        {box && (
          <span className="lg-nav-hl" aria-hidden="true" style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)`, borderRadius: 18 }} />
        )}
        {tabItems.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'lg-press relative z-[1] flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] px-1 text-[11px] font-medium',
                isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300',
              )
            }
          >
            <t.icon className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate">{t.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMore}
          aria-label="More navigation"
          aria-expanded={moreOpen}
          className="lg-press relative z-[1] flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
