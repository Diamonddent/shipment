import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calculator, ExternalLink } from 'lucide-react';
import { Card, CardBody, EmptyState, ErrorState, PageHeader, Select, Spinner } from '@/components/ui';
import { useShipments } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { useShipmentBundle } from '@/features/shipments/useShipmentBundle';
import { fmtMoney } from '@/lib/format';
import { LandedCostCalculator } from './LandedCostCalculator';

export default function LandedCostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const shipments = useShipments();
  return (
    <div>
      <PageHeader title="Landed Cost Calculator" subtitle="Allocate shipment expenses to products by value, quantity, net weight, gross weight or manual shares" />
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="min-w-[280px] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Shipment
            <Select className="mt-1" value={id ?? ''} onChange={(e) => navigate(e.target.value ? `/landed-cost/${e.target.value}` : '/landed-cost')}>
              <option value="">Select a shipment…</option>
              {(shipments.data ?? []).filter((s) => s.status !== 'cancelled').map((s) => (
                <option key={s.id} value={s.id}>{s.shipment_code} · PO {s.po_number ?? '—'} · {s.supplier?.name ?? ''}</option>
              ))}
            </Select>
          </label>
          {id && <Link to={`/shipments/${id}`} className="inline-flex h-9 items-center gap-1 text-sm text-accent hover:underline"><ExternalLink className="h-4 w-4" /> Open shipment</Link>}
        </CardBody>
      </Card>
      {id ? <Calc id={id} /> : (
        <Card><EmptyState icon={<Calculator className="h-6 w-6" />} title="Choose a shipment" message="Pick a shipment above to calculate the landed cost per product and per unit." /></Card>
      )}
    </div>
  );
}

function Calc({ id }: { id: string }) {
  const b = useShipmentBundle(id);
  const perms = usePermissions();
  if (b.loading) return <Spinner />;
  if (b.error || !b.shipment.data) return <Card><ErrorState error={b.error ?? 'Shipment not found'} /></Card>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Total landed cost {fmtMoney(b.analysis.totalLandedCost)} · product invoice {fmtMoney(b.analysis.productInvoiceValue)} · additional {fmtMoney(b.analysis.additionalExpenseTotal)}
      </p>
      <LandedCostCalculator
        shipment={b.shipment.data}
        products={b.products.data ?? []}
        expenses={b.expenses.data ?? []}
        categories={b.categories.data ?? []}
        saved={b.allocations.data ?? []}
        canEdit={perms.canEditShipment(b.shipment.data)}
      />
    </div>
  );
}
