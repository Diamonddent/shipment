import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PAYMENT_STATUS_LABEL, REVIEW_STATUS_LABEL, SHIPMENT_STATUS_LABEL } from '@/lib/constants';
import type { PaymentStatus, ReviewStatus, ShipmentStatus } from '@/types/database';

type Tone = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'violet';
const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300',
  blue: 'bg-accent-50 text-accent ring-accent/20 dark:bg-accent/10 dark:text-accent-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

const shipmentTone: Record<ShipmentStatus, Tone> = {
  draft: 'slate',
  preparing: 'violet',
  in_transit: 'amber',
  arrived: 'blue',
  customs_clearance: 'amber',
  delivered: 'blue',
  completed: 'green',
  cancelled: 'red',
};
export function ShipmentStatusPill({ status }: { status: ShipmentStatus }) {
  return (
    <Badge tone={shipmentTone[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {SHIPMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

const payTone: Record<PaymentStatus, Tone> = { paid: 'green', partially_paid: 'amber', unpaid: 'red', not_applicable: 'slate' };
export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  if (status === 'not_applicable') return <span className="text-xs text-slate-400" title="Supplier invoice — no payment status">—</span>;
  return <Badge tone={payTone[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

const reviewTone: Record<ReviewStatus, Tone> = { approved: 'green', pending: 'slate', rejected: 'red' };
export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  return <Badge tone={reviewTone[status]}>{REVIEW_STATUS_LABEL[status]}</Badge>;
}

export function DemoBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="violet">DEMO</Badge> : null;
}
