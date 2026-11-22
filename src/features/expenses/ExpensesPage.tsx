import { useMemo, useState } from 'react';
import { Download, Plus, Receipt } from 'lucide-react';
import { Button, Card, Dropdown, EmptyState, ErrorState, Field, Input, KpiCard, PageHeader, SearchInput, Select, TableSkeleton } from '@/components/ui';
import { useAllExpenses, useCategories, useShipments, useSuppliers } from '@/hooks/queries';
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL, REVIEW_STATUS_LABEL } from '@/lib/constants';
import { outstandingSar, sumMoney } from '@/lib/calculations';
import { fmtMoney } from '@/lib/format';
import { inRange } from '@/lib/utils';
import { exportCSV, exportExcel, exportPDF, stamp, type ExportTable } from '@/lib/export';
import { ExpenseFormModal } from './ExpenseFormModal';
import { ExpensesTable } from './ExpensesTable';

export default function ExpensesPage() {
  const expenses = useAllExpenses();
  const categories = useCategories();
  const shipments = useShipments(true);
  const suppliers = useSuppliers();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (expenses.data ?? []).filter((e) => {
      if (category && e.category_id !== category) return false;
      if (status && e.payment_status !== status) return false;
      if (shipmentId && e.shipment_id !== shipmentId) return false;
      if (supplierId && e.shipment?.supplier_id !== supplierId && e.supplier_id !== supplierId) return false;
      if (!inRange(e.invoice_date ?? e.created_at, from, to)) return false;
      if (needle) {
        const hay = [e.expense_no, e.invoice_no, e.service_provider, e.description, e.category?.name, e.shipment?.shipment_code, e.shipment?.po_number]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [expenses.data, q, category, status, shipmentId, supplierId, from, to]);

  const totals = useMemo(() => {
    const out = sumMoney(filtered.filter((e) => (e.payment_status === 'unpaid' || e.payment_status === 'partially_paid')).map((e) => outstandingSar(Number(e.original_amount), Number(e.vat_amount), Number(e.paid_amount), Number(e.exchange_rate))));
    return {
      sar: sumMoney(filtered.map((e) => Number(e.amount_sar))),
      vat: sumMoney(filtered.map((e) => Number(e.vat_amount_sar))),
      outstanding: out,
      unpaid: filtered.filter((e) => (e.payment_status === 'unpaid' || e.payment_status === 'partially_paid')).length,
    };
  }, [filtered]);

  const table = (): ExportTable => ({
    name: 'Expenses',
    columns: [
      { header: 'Expense ID', key: 'expense_no' },
      { header: 'Shipment', key: 'shipment' },
      { header: 'PO', key: 'po' },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Description', key: 'description', width: 28 },
      { header: 'Provider', key: 'provider', width: 26 },
      { header: 'Invoice No', key: 'invoice_no' },
      { header: 'Invoice Date', key: 'invoice_date', format: 'date' },
      { header: 'Currency', key: 'currency' },
      { header: 'Original', key: 'original', format: 'money' },
      { header: 'Rate', key: 'rate', format: 'rate' },
      { header: 'Amount SAR', key: 'sar', format: 'money' },
      { header: 'VAT SAR', key: 'vat', format: 'money' },
      { header: 'Payment', key: 'payment' },
      { header: 'Paid On', key: 'payment_date', format: 'date' },
      { header: 'Method', key: 'method' },
      { header: 'Review', key: 'review' },
    ],
    rows: filtered.map((e) => ({
      expense_no: e.expense_no,
      shipment: e.shipment?.shipment_code ?? '',
      po: e.shipment?.po_number ?? '',
      category: e.category?.name ?? '',
      description: e.description ?? '',
      provider: e.service_provider ?? '',
      invoice_no: e.invoice_no ?? '',
      invoice_date: e.invoice_date,
      currency: e.currency_code,
      original: Number(e.original_amount),
      rate: Number(e.exchange_rate),
      sar: Number(e.amount_sar),
      vat: Number(e.vat_amount_sar),
      payment: PAYMENT_STATUS_LABEL[e.payment_status],
      payment_date: e.payment_date,
      method: e.payment_method ? PAYMENT_METHOD_LABEL[e.payment_method] : '',
      review: REVIEW_STATUS_LABEL[e.review_status],
    })),
    totals: { expense_no: 'TOTAL', sar: totals.sar, vat: totals.vat },
  });
  const meta = { title: 'Expense Register', filters: [from || to ? `Period: ${from || '…'} to ${to || '…'}` : 'All dates', `${filtered.length} expenses`] };

  return (
    <div>
      <PageHeader
        title="Expense Management"
        subtitle="All shipment expenses converted to SAR at the rate stored on each record"
        actions={
          <>
            <Dropdown
              trigger={<Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!filtered.length}>Export</Button>}
              items={[
                { label: 'Excel (.xlsx)', onClick: () => void exportExcel(`Expenses_${stamp()}`, [table()], meta) },
                { label: 'CSV', onClick: () => exportCSV(`Expenses_${stamp()}`, table()) },
                { label: 'PDF', onClick: () => void exportPDF(`Expenses_${stamp()}`, [table()], meta) },
              ]}
            />
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add expense</Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Expenses (filtered)" value={filtered.length} icon={<Receipt className="h-5 w-5" />} />
        <KpiCard label="Total amount" value={fmtMoney(totals.sar)} tone="blue" />
        <KpiCard label="Service-invoice VAT" value={fmtMoney(totals.vat)} tone="violet" hint="Reported separately" />
        <KpiCard label="Outstanding" value={fmtMoney(totals.outstanding)} tone="red" hint={`${totals.unpaid} unpaid / partial`} />
      </div>
      <Card>
        <div className="grid gap-3 border-b border-line p-4 dark:border-navy-700 sm:grid-cols-2 lg:grid-cols-8">
          <SearchInput value={q} onChange={setQ} placeholder="Search expense, invoice, provider…" className="lg:col-span-2" />
          <Select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} aria-label="Shipment">
            <option value="">All shipments</option>
            {(shipments.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.shipment_code} · {s.po_number}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
            <option value="">All suppliers</option>
            {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Payment status">
            <option value="">Any payment status</option>
            {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <Field label=""><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></Field>
            <Field label=""><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></Field>
          </div>
        </div>
        {expenses.isLoading ? (
          <TableSkeleton />
        ) : expenses.isError ? (
          <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
        ) : (
          <ExpensesTable
            rows={filtered}
            empty={
              <EmptyState
                title={expenses.data?.length ? 'No expenses match your filters' : 'No expenses yet'}
                message={expenses.data?.length ? 'Try clearing a filter.' : 'Add the supplier invoice, freight, customs and other charges for each shipment.'}
                action={!expenses.data?.length && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add expense</Button>}
              />
            }
          />
        )}
      </Card>
      <ExpenseFormModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
