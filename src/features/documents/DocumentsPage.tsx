import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, SearchInput, Select, TableSkeleton } from '@/components/ui';
import { useAllExpenses, useDocuments, useShipments } from '@/hooks/queries';
import { usePermissions } from '@/hooks/useAuth';
import { DOC_TYPES } from '@/lib/constants';
import { DocumentUploader, DocumentsTable, DriveStatus, ZipButton } from './DocumentsPanel';

export default function DocumentsPage() {
  const docs = useDocuments();
  const shipments = useShipments(true);
  const expenses = useAllExpenses();
  const perms = usePermissions();
  const [q, setQ] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [type, setType] = useState('');

  const shipment = shipments.data?.find((s) => s.id === shipmentId);
  const rows = useMemo(
    () =>
      (docs.data ?? []).filter(
        (d) =>
          (!shipmentId || d.shipment_id === shipmentId) &&
          (!type || d.doc_type === type) &&
          (!q || [d.doc_no, d.file_name, d.original_filename, d.shipment?.shipment_code, d.shipment?.po_number, d.expense?.invoice_no].join(' ').toLowerCase().includes(q.toLowerCase())),
      ),
    [docs.data, q, shipmentId, type],
  );

  return (
    <div>
      <PageHeader title="Document Management" subtitle="Invoices, customs declarations, SADAD receipts, AWB/BL, packing lists and certificates — stored in Google Drive" />
      <div className="mb-5"><DriveStatus /></div>
      <Card className="mb-5">
        <CardHeader title="Upload to a shipment" subtitle="Pick the shipment, then the files" />
        <CardBody className="space-y-4">
          <Select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} className="max-w-md" aria-label="Shipment">
            <option value="">Select shipment (also filters the list)…</option>
            {(shipments.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.shipment_code} · PO {s.po_number ?? '—'} · {s.supplier?.name ?? ''}</option>)}
          </Select>
          {shipment ? (
            perms.canEditShipment(shipment) ? (
              <DocumentUploader shipment={shipment} expenses={(expenses.data ?? []).filter((e) => e.shipment_id === shipment.id)} />
            ) : (
              <p className="text-sm text-slate-500">You can view this shipment’s documents but not upload to it.</p>
            )
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 dark:border-navy-700">
          <SearchInput value={q} onChange={setQ} placeholder="Document no., file, PO, invoice…" className="min-w-[240px] flex-1" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-56" aria-label="Type">
            <option value="">All document types</option>
            {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          {shipment && <ZipButton shipment={shipment} docs={rows} />}
        </div>
        {docs.isLoading ? <TableSkeleton /> : docs.isError ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> : rows.length === 0 ? (
          <EmptyState icon={<FolderOpen className="h-6 w-6" />} title={docs.data?.length ? 'No documents match' : 'No documents yet'} message="Select a shipment above to upload its documents." />
        ) : (
          <DocumentsTable rows={rows} shipments={shipments.data ?? []} showShipment />
        )}
      </Card>
    </div>
  );
}
