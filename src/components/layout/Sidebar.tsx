import { NavLink } from 'react-router-dom';
import {
  BarChart3, Boxes, Calculator, ChevronsLeft, ChevronsRight, FileText, FolderOpen, LayoutDashboard, PackagePlus,
  Receipt, Settings, Ship, Truck, Building2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_TITLE, COMPANY_NAME } from '@/lib/constants';
import { usePermissions } from '@/hooks/useAuth';

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
      { to: '/products', label: 'Products', icon: Boxes },
      { to: '/landed-cost', label: 'Landed Cost', icon: Calculator },
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

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { isAdmin, isManager } = usePermissions();
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-navy-900 text-slate-300 transition-all duration-200',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
          'w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex min-h-[64px] items-center gap-3 border-b border-white/10 px-4 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-primary shadow-lg">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 12L2 9z" />
              <path d="M2 9h20M12 21 8 9l4-6 4 6z" />
            </svg>
          </div>
          <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
            <p className="text-[12px] font-bold leading-tight tracking-wide text-white">{COMPANY_NAME}</p>
            <p className="mt-0.5 text-[10.5px] leading-tight text-slate-400">{APP_TITLE}</p>
          </div>
          <button onClick={onCloseMobile} className="ml-auto rounded-md p-1 text-slate-400 hover:text-white lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.label} className="mb-5">
              <p className={cn('mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500', collapsed && 'lg:hidden')}>{g.label}</p>
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
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                          isActive ? 'bg-white/10 text-white shadow-inner' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                          collapsed && 'lg:justify-center lg:px-0',
                        )
                      }
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className={cn('mb-2 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-400', collapsed && 'lg:hidden')}>
            <FileText className="mr-1 inline h-3.5 w-3.5" />
            {isAdmin ? 'Administrator access' : isManager ? 'Manager access' : 'Employee access'}
          </div>
          <button
            onClick={onToggle}
            className="hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white lg:flex"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>
    </>
  );
}
