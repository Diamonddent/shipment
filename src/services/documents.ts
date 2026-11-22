import { supabase } from '@/lib/supabase';
import { DOC_TYPE_FILE_LABEL, DOC_TYPE_LABEL } from '@/lib/constants';
import type { DocType, DocumentWithRefs, Shipment, ShipmentDocument } from '@/types/database';
import { fetchAll, unwrap } from './base';
import { documentFileName, documentStorage, shipmentFolderName, zipFileName } from './googleDrive';
import { auditService } from './reference';

export const DOCUMENT_SELECT =
  '*, shipment:shipments(id,shipment_code,po_number), expense:shipment_expenses(id,expense_no,invoice_no), uploader:profiles!shipment_documents_uploaded_by_fkey(id,full_name)';

export interface UploadInput {
  shipment: Pick<Shipment, 'id' | 'shipment_code' | 'po_number'>;
  file: File;
  docType: DocType;
  expenseId?: string | null;
  notes?: string | null;
  userId: string;
}

export const documentsService = {
  listAll: () =>
    fetchAll<DocumentWithRefs>((a, b) =>
      supabase.from('shipment_documents').select(DOCUMENT_SELECT).eq('is_deleted', false).order('created_at', { ascending: false }).range(a, b),
    ),
  listForShipment: async (shipmentId: string) =>
    unwrap(
      await supabase.from('shipment_documents').select(DOCUMENT_SELECT).eq('shipment_id', shipmentId).eq('is_deleted', false).order('doc_no'),
    ) as DocumentWithRefs[],

  /**
   * 1) reserve DOC-<PO>-<NNN> from the database (atomic per-shipment counter)
   * 2) upload "<docno>_<Doc-Type>.<ext>" into "Diamond Dent Shipments/<PO> – <code>"
   * 3) record metadata in shipment_documents
   */
  upload: async ({ shipment, file, docType, expenseId, notes, userId }: UploadInput) => {
    await documentStorage.connect();
    const docNo = unwrap(await supabase.rpc('reserve_document_no', { p_shipment_id: shipment.id })) as string;
    const fileName = documentFileName(docNo, DOC_TYPE_FILE_LABEL[docType], file.name);
    const folderId = await documentStorage.ensureShipmentFolder(shipmentFolderName(shipment.po_number, shipment.shipment_code));
    const stored = await documentStorage.upload(file, fileName, folderId, file.type);
    try {
      return unwrap(
        await supabase
          .from('shipment_documents')
          .insert({
            shipment_id: shipment.id,
            expense_id: expenseId || null,
            doc_no: docNo,
            doc_type: docType,
            original_filename: file.name,
            file_name: fileName,
            mime_type: file.type || stored.mimeType,
            size_bytes: stored.size ?? file.size,
            storage_provider: 'google_drive',
            drive_file_id: stored.id,
            drive_folder_id: folderId,
            drive_web_link: stored.webViewLink,
            notes: notes || null,
            uploaded_by: userId,
          })
          .select(DOCUMENT_SELECT)
          .single(),
      ) as DocumentWithRefs;
    } catch (e) {
      // keep Drive and database consistent
      await documentStorage.remove(stored.id).catch(() => undefined);
      throw e;
    }
  },

  download: async (doc: ShipmentDocument) => {
    if (!doc.drive_file_id) throw new Error('This document has no file in Google Drive.');
    return documentStorage.download(doc.drive_file_id);
  },

  /** Trashes the Drive file, soft-deletes the record and writes an audit entry. */
  remove: async (doc: ShipmentDocument) => {
    const rows = unwrap(await supabase.from('shipment_documents').update({ is_deleted: true }).eq('id', doc.id).select('id')) as unknown[];
    if (!rows.length) throw new Error('You do not have permission to delete this document.');
    if (doc.drive_file_id) {
      try {
        await documentStorage.remove(doc.drive_file_id);
      } catch (e) {
        await auditService.log('shipment_documents', doc.id, `Record deleted but Drive file ${doc.drive_file_id} could not be trashed: ${(e as Error).message}`);
        throw new Error(`The document record was removed, but the Drive file could not be moved to trash: ${(e as Error).message}`);
      }
    }
    await auditService.log('shipment_documents', doc.id, `Document ${doc.doc_no} (${DOC_TYPE_LABEL[doc.doc_type]}) deleted`);
  },

  /** Builds "<PO>_<code>_Documents.zip" with one folder per document type. */
  downloadZip: async (shipment: Pick<Shipment, 'shipment_code' | 'po_number'>, docs: ShipmentDocument[], onProgress?: (done: number, total: number) => void) => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const files = docs.filter((d) => d.drive_file_id);
    const failed: string[] = [];
    let done = 0;
    for (const d of files) {
      try {
        const blob = await documentStorage.download(d.drive_file_id!);
        zip.folder(DOC_TYPE_LABEL[d.doc_type].replace(/[\\/]/g, '-'))!.file(d.file_name, blob);
      } catch {
        failed.push(d.doc_no);
      }
      done += 1;
      onProgress?.(done, files.length);
    }
    if (failed.length === files.length) throw new Error('None of the files could be downloaded from Google Drive.');
    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, fileName: zipFileName(shipment.po_number, shipment.shipment_code), failed };
  },
};
