import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, FileArchive, FileText, Image as ImageIcon, Link2, Trash2, Upload } from 'lucide-react';
import { Alert, Button, ConfirmDialog, DataTable, EmptyState, Field, Input, Select, useToast, type Column } from '@/components/ui';
import { documentsService } from '@/services/documents';
import { googleDrive, loadGis } from '@/services/googleDrive';
import { qk, useSettings } from '@/hooks/queries';
import { useAuth, usePermissions } from '@/hooks/useAuth';
import { ALLOWED_UPLOAD_EXT, DOC_TYPES, DOC_TYPE_LABEL } from '@/lib/constants';
import { fmtBytes, fmtDateTime } from '@/lib/format';
import { downloadBlob } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import type { DocType, DocumentWithRefs, ExpenseWithRefs, Shipment } from '@/types/database';

export function DriveStatus() {
  const [connected, setConnected] = useState(googleDrive.isConnected());
  const toast = useToast();
  useEffect(() => {
    if (googleDrive.isConfigured()) void loadGis().catch(() => undefined);
  }, []);
  if (!googleDrive.isConfigured())
    return (
      <Alert tone="amber" title="Google Drive is not configured">
        Set <code>VITE_GOOGLE_CLIENT_ID</code> and rebuild to enable uploads. Existing document records remain visible.
      </Alert>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-slate-50 px-4 py-2.5 text-sm dark:border-navy-700 dark:bg-navy-800">
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      <span className="flex-1 text-slate-600 dark:text-slate-300">
        {connected ? 'Connected to Google Drive' : 'Google Drive access is requested on your first upload or download.'}{' '}
        <span className="text-xs text-slate-500">
          ({googleDrive.rootFolderId ? 'company folder, full Drive scope' : 'app folder, drive.file scope'})
        </span>
      </span>
      {googleDrive.rootFolderId && (
        <a className="inline-flex items-center gap-1 text-xs text-accent hover:underline" href={`https://drive.google.com/drive/folders/${googleDrive.rootFolderId}`} target="_blank" rel="noreferrer">
          <Link2 className="h-3.5 w-3.5" /> Open root folder
        </a>
      )}
      {!connected ? (
        <Button size="sm" variant="outline" onClick={() => googleDrive.connect().then(() => setConnected(true), (e) => toast.error('Google Drive', e))}>
          Connect
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => { googleDrive.disconnect(); setConnected(false); }}>Disconnect</Button>
      )}
    </div>
  );
}

export function DocumentsTable({ rows, shipments, showShipment }: { rows: DocumentWithRefs[]; shipments: Pick<Shipment, 'id' | 'created_by' | 'assigned_to'>[]; showShipment?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const [deleting, setDeleting] = useState<DocumentWithRefs | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: (d: DocumentWithRefs) => documentsService.remove(d),
    onSuccess: () => {
      toast.success('Document deleted', 'Moved to the Google Drive trash and logged in the audit trail.');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (e) => {
      toast.error('Delete failed', e);
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const download = async (d: DocumentWithRefs) => {
    setBusy(d.id);
    try {
      downloadBlob(await documentsService.download(d), d.file_name);
    } catch (e) {
      toast.error('Download failed', e);
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<DocumentWithRefs>[] = [
    {
      key: 'no',
      header: 'Document',
      sortValue: (d) => d.doc_no,
      cell: (d) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent dark:bg-navy-800">
            {d.mime_type?.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 dark:text-white">{d.doc_no}</p>
            <p className="truncate text-xs text-slate-500" title={d.original_filename}>{d.file_name}</p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', sortValue: (d) => d.doc_type, cell: (d) => DOC_TYPE_LABEL[d.doc_type] },
    ...(showShipment
      ? [{ key: 'shp', header: 'Shipment', sortValue: (d: DocumentWithRefs) => d.shipment?.shipment_code ?? '', cell: (d: DocumentWithRefs) => <div><p>{d.shipment?.shipment_code}</p><p className="text-xs text-slate-500">{d.shipment?.po_number}</p></div> } as Column<DocumentWithRefs>]
      : []),
    { key: 'exp', header: 'Linked expense', hideBelow: 'md', cell: (d) => (d.expense ? `${d.expense.expense_no}${d.expense.invoice_no ? ` · ${d.expense.invoice_no}` : ''}` : '—') },
    { key: 'size', header: 'Size', align: 'right', hideBelow: 'lg', sortValue: (d) => d.size_bytes ?? 0, cell: (d) => fmtBytes(d.size_bytes) },
    { key: 'by', header: 'Uploaded', hideBelow: 'lg', sortValue: (d) => d.created_at, cell: (d) => <div className="text-xs"><p>{d.uploader?.full_name ?? '—'}</p><p className="text-slate-500">{fmtDateTime(d.created_at)}</p></div> },
    {
      key: 'a',
      header: '',
      align: 'right',
      cell: (d) => {
        const shp = shipments.find((s) => s.id === d.shipment_id);
        return (
          <div className="flex justify-end gap-1">
            {d.drive_web_link && (
              <a href={d.drive_web_link} target="_blank" rel="noreferrer" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-accent dark:hover:bg-navy-800" title="View in Google Drive" aria-label="View in Google Drive">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {d.drive_file_id && (
              <button onClick={() => void download(d)} disabled={busy === d.id} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-navy-800" title="Download" aria-label="Download">
                <Download className="h-4 w-4" />
              </button>
            )}
            {perms.canDeleteDocument(d, shp) && (
              <button onClick={() => setDeleting(d)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} initialSort={{ key: 'no', dir: 'asc' }} empty={<EmptyState title="No documents" message="Uploaded invoices, declarations, receipts and certificates appear here." />} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        title="Delete document?"
        message={`${deleting?.doc_no} (${deleting ? DOC_TYPE_LABEL[deleting.doc_type] : ''}) will be moved to the Google Drive trash and removed from this shipment. The deletion is recorded in the audit log.`}
        confirmLabel="Delete document"
      />
    </>
  );
}

export function DocumentUploader({
  shipment,
  expenses,
  onUploaded,
}: {
  shipment: Pick<Shipment, 'id' | 'shipment_code' | 'po_number'>;
  expenses: ExpenseWithRefs[];
  onUploaded?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useAuth();
  const { settings } = useSettings();
  const [docType, setDocType] = useState<DocType>('supplier_invoice');
  const [expenseId, setExpenseId] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (list: FileList | null) => {
    const arr = Array.from(list ?? []);
    const bad = arr.filter((f) => !ALLOWED_UPLOAD_EXT.includes((f.name.split('.').pop() ?? '').toLowerCase()));
    const big = arr.filter((f) => f.size > settings.maxUploadMb * 1024 * 1024);
    if (bad.length) toast.error('Only PDF, JPG and PNG files are allowed', bad.map((f) => f.name).join(', '));
    if (big.length) toast.error(`Files larger than ${settings.maxUploadMb} MB were skipped`, big.map((f) => f.name).join(', '));
    setFiles(arr.filter((f) => !bad.includes(f) && !big.includes(f)));
  };

  const upload = async () => {
    if (!session || files.length === 0) return;
    const failures: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        await documentsService.upload({ shipment, file: files[i], docType, expenseId: expenseId || null, notes, userId: session.user.id });
      } catch (e) {
        failures.push(`${files[i].name}: ${errorMessage(e)}`);
        if (i === 0 && /authori|cancel|popup/i.test(errorMessage(e))) break;
      }
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: qk.shipment(shipment.id) });
    if (failures.length) toast.error(`${failures.length} file(s) failed`, failures.join(' · '));
    if (failures.length < files.length) {
      toast.success(`${files.length - failures.length} document(s) uploaded to Google Drive`);
      setFiles([]);
      setNotes('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.();
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Document type">
        <Select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
          {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </Select>
      </Field>
      <Field label="Link to expense (optional)">
        <Select value={expenseId} onChange={(e) => setExpenseId(e.target.value)}>
          <option value="">— Shipment level —</option>
          {expenses.map((e) => <option key={e.id} value={e.id}>{e.expense_no} · {e.category?.name} · {e.invoice_no ?? ''}</option>)}
        </Select>
      </Field>
      <Field label="Files (PDF, JPG, PNG)" className="lg:col-span-2">
        <Input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => pick(e.target.files)} className="py-1.5" disabled={!googleDrive.isConfigured()} />
      </Field>
      <div className="flex items-end">
        <Button className="w-full" icon={<Upload className="h-4 w-4" />} onClick={() => void upload()} disabled={!files.length || !googleDrive.isConfigured()} loading={!!progress}>
          {progress ?? 'Upload'}
        </Button>
      </div>
      <Field label="Notes (optional)" className="sm:col-span-2 lg:col-span-5">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-5">
        Files are renamed “DOC-{(shipment.po_number ?? shipment.shipment_code).replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-NNN_Type” and saved in Google Drive folder “{shipment.po_number ?? 'No PO'} – {shipment.shipment_code}”. Only metadata is stored in the database.
      </p>
    </div>
  );
}

export function ZipButton({ shipment, docs }: { shipment: Pick<Shipment, 'shipment_code' | 'po_number'>; docs: DocumentWithRefs[] }) {
  const toast = useToast();
  const [state, setState] = useState<string | null>(null);
  const run = async () => {
    try {
      setState('Preparing…');
      const { blob, fileName, failed } = await documentsService.downloadZip(shipment, docs, (d, t) => setState(`${d}/${t}`));
      downloadBlob(blob, fileName);
      if (failed.length) toast.error('Some files could not be included', failed.join(', '));
      else toast.success('ZIP downloaded', fileName);
    } catch (e) {
      toast.error('ZIP download failed', e);
    } finally {
      setState(null);
    }
  };
  return (
    <Button variant="outline" size="sm" icon={<FileArchive className="h-4 w-4" />} onClick={() => void run()} disabled={!docs.some((d) => d.drive_file_id) || !googleDrive.isConfigured()} loading={!!state}>
      {state ?? 'Download ZIP'}
    </Button>
  );
}
