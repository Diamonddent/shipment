import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PAYMENT_STATUS_LABEL, REVIEW_STATUS_LABEL, SHIPMENT_STATUS_LABEL } from '@/lib/constants';
import type { PaymentStatus, ReviewStatus, ShipmentStatus } from '@/types/database';

type Tone = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'violet';
const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-700/30 dark:bg-emerald-400/10 dark:text-[#3ddc97] dark:ring-[#3ddc97]/40',
  amber: 'bg-amber-50 text-amber-800 ring-amber-700/30 dark:bg-amber-400/10 dark:text-[#ffb547] dark:ring-[#ffb547]/40',
  red: 'bg-red-50 text-red-800 ring-red-700/30 dark:bg-red-400/10 dark:text-[#ff8a96] dark:ring-[#ff8a96]/40',
  slate: 'bg-slate-100 text-slate-700 ring-slate-600/25 dark:bg-white/5 dark:text-slate-200 dark:ring-white/25',
  blue: 'bg-blue-50 text-blue-800 ring-blue-700/30 dark:bg-[#4f7cff]/10 dark:text-[#a9c0ff] dark:ring-[#4f7cff]/45',
  violet: 'bg-violet-50 text-violet-800 ring-violet-700/30 dark:bg-violet-400/10 dark:text-[#c3a6ff] dark:ring-[#9a6bff]/45',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset', tones[tone], className)}>
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
  if (status === 'not_applicable') return <span className="text-xs text-slate-500" title="Supplier invoice — no payment status">—</span>;
  return <Badge tone={payTone[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

const reviewTone: Record<ReviewStatus, Tone> = { approved: 'green', pending: 'slate', rejected: 'red' };
export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  return <Badge tone={reviewTone[status]}>{REVIEW_STATUS_LABEL[status]}</Badge>;
}

export function DemoBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="violet">DEMO</Badge> : null;
}
