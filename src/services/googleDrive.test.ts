import { describe, expect, it } from 'vitest';
import { documentFileName, parseDriveFolderId, shipmentFolderName, zipFileName } from './googleDrive';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-012';

describe('Google Drive helpers', () => {
  it('parses folder IDs from pasted links', () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(parseDriveFolderId(`  ${ID}  `)).toBe(ID);
    expect(parseDriveFolderId('https://example.com/nothing')).toBeNull();
    expect(parseDriveFolderId('')).toBeNull();
  });
  it('names documents, folders and zips per the client convention', () => {
    expect(documentFileName('DOC-PO4501-001', 'Supplier-Invoice', 'scan 01.PDF')).toBe('DOC-PO4501-001_Supplier-Invoice.pdf');
    expect(documentFileName('DOC-PO4501-002', 'Other', 'noext')).toBe('DOC-PO4501-002_Other');
    expect(shipmentFolderName('PO-4501', 'SHP-2026-0001')).toBe('PO-4501 – SHP-2026-0001');
    expect(shipmentFolderName(null, 'SHP-2026-0002')).toBe('No PO – SHP-2026-0002');
    expect(zipFileName('PO-4501', 'SHP-2026-0001')).toBe('PO-4501_SHP-2026-0001_Documents.zip');
  });
});
