import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Search, Settings, Sun, UserCircle2 } from 'lucide-react';
import { useAuth, usePermissions } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useAllExpenses, useShipments } from '@/hooks/queries';
import { shipmentWarnings } from '@/lib/warnings';
import { ROLE_LABEL } from '@/lib/constants';
import { Dropdown } from '@/components/ui';
import { cn } from '@/lib/utils';

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const navigate = useNavigate();
  const { profile, session, signOut } = useAuth();
  const { role, isAdmin } = usePermissions();
  const { dark, toggle } = useTheme();
  const [q, setQ] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const shipments = useShipments();
  const expenses = useAllExpenses();

  const notifications = useMemo(() => {
    if (!shipments.data || !expenses.data) return [];
    const byShipment = new Map<string, typeof expenses.data>();
    expenses.data.forEach((e) => {
      const arr = byShipment.get(e.shipment_id) ?? [];
      arr.push(e);
      byShipment.set(e.shipment_id, arr);
    });
    return shipments.data
      .flatMap((s) =>
        shipmentWarnings(s, byShipment.get(s.id) ?? [])
          .filter((w) => w.level !== 'info')
          .map((w) => ({ ...w, shipment: s })),
      )
      .sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  }, [shipments.data, expenses.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/shipments?q=${encodeURIComponent(q.trim())}`);
  };

  const name = profile?.full_name || session?.user.email || 'User';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur dark:border-navy-700 dark:bg-navy-900/90 sm:px-6">
      <button onClick={onOpenMobile} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-800 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <form onSubmit={submit} className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search shipment ID, PO, invoice, AWB…"
          className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-navy-700 dark:bg-navy-950 dark:text-slate-100"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={toggle} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800" aria-label="Toggle dark mode" title="Toggle dark mode">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {notifications.length > 99 ? '99+' : notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-pop animate-fadein dark:border-navy-700 dark:bg-navy-900">
                <div className="border-b border-line px-4 py-3 text-sm font-semibold dark:border-navy-700">Data warnings</div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">All shipments look complete.</p>
                  ) : (
                    notifications.slice(0, 30).map((n, i) => (
                      <Link
                        key={i}
                        to={`/shipments/${n.shipment.id}`}
                        onClick={() => setNotifOpen(false)}
                        className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-slate-50 dark:border-navy-700 dark:hover:bg-navy-800"
                      >
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.level === 'error' ? 'bg-red-500' : 'bg-amber-500')} />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{n.shipment.shipment_code}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{n.message}</span>
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <Dropdown
          trigger={
            <button className="ml-1 flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-navy-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {name.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[140px] truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{name}</span>
                <span className="block text-[11px] text-slate-500">{role ? ROLE_LABEL[role] : 'No role'}</span>
              </span>
            </button>
          }
          items={[
            { label: 'My profile', icon: <UserCircle2 className="h-4 w-4" />, onClick: () => navigate('/settings?tab=profile') },
            { label: 'Settings', icon: <Settings className="h-4 w-4" />, onClick: () => navigate('/settings'), hidden: !isAdmin },
            { label: 'Sign out', icon: <LogOut className="h-4 w-4" />, onClick: () => void signOut(), danger: true },
          ]}
        />
      </div>
    </header>
  );
}
