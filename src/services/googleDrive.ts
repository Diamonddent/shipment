/**
 * Google Drive document storage (client requirement: files live in the
 * company's Google Drive, not in Supabase Storage).
 *
 * Uses Google Identity Services (GIS) token client in the browser with the
 * scope configured in Settings (default https://www.googleapis.com/auth/drive.file)
 * and the Drive REST v3 API. Nothing here is Supabase-specific: implement the
 * `DocumentStorage` interface to swap in another provider (SharePoint, S3, Odoo
 * attachments...).
 */
import { env } from '@/lib/env';

export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  webViewLink: string | null;
  folderId: string;
}

export interface DocumentStorage {
  readonly provider: 'google_drive';
  isConfigured(): boolean;
  isConnected(): boolean;
  connect(interactive?: boolean): Promise<void>;
  disconnect(): void;
  ensureShipmentFolder(folderName: string): Promise<string>;
  upload(file: Blob, fileName: string, folderId: string, mimeType?: string): Promise<StoredFile>;
  download(fileId: string): Promise<Blob>;
  remove(fileId: string): Promise<void>;
}

export interface DriveConfig {
  /** Name of the folder the app creates when no existing folder is configured. */
  rootFolderName: string;
  /**
   * ID of the company's existing Drive folder (Settings > Google Drive). When set,
   * per-PO shipment folders are created directly inside it and the full
   * https://www.googleapis.com/auth/drive scope is requested, because drive.file
   * cannot write into folders the app did not create.
   */
  rootFolderId?: string | null;
}

// ---------------------------------------------------------------------------
// Minimal typings for Google Identity Services
// ---------------------------------------------------------------------------
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  callback: (r: TokenResponse) => void;
  requestAccessToken: (o?: { prompt?: string }) => void;
}
interface GoogleOAuth2 {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let gisPromise: Promise<void> | null = null;
/** Preload the GIS script early so the consent popup opens directly from the user's click. */
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Could not load Google sign-in. Check your internet connection or ad blocker.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

function escapeQ(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class DriveError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'DriveError';
  }
}

class GoogleDriveStorage implements DocumentStorage {
  readonly provider = 'google_drive' as const;
  private token: string | null = null;
  private expiresAt = 0;
  private client: TokenClient | null = null;
  private clientScope = '';
  private config: DriveConfig = { rootFolderName: 'Diamond Dent Shipments', rootFolderId: null };
  private folderCache = new Map<string, string>();

  configure(cfg: Partial<DriveConfig>): void {
    const next: DriveConfig = {
      rootFolderName: cfg.rootFolderName?.trim() || this.config.rootFolderName,
      rootFolderId: cfg.rootFolderId === undefined ? this.config.rootFolderId : cfg.rootFolderId?.trim() || null,
    };
    const prevScope = this.scopeUrl;
    if (next.rootFolderName !== this.config.rootFolderName || next.rootFolderId !== this.config.rootFolderId) this.folderCache.clear();
    this.config = next;
    if (this.scopeUrl !== prevScope) {
      this.client = null;
      this.token = null;
    }
  }

  get scope(): 'drive' | 'drive.file' {
    return this.config.rootFolderId ? 'drive' : 'drive.file';
  }

  get scopeUrl(): string {
    return `https://www.googleapis.com/auth/${this.scope}`;
  }

  get rootFolderId(): string | null {
    return this.config.rootFolderId ?? null;
  }

  isConfigured(): boolean {
    return Boolean(env.googleClientId);
  }

  isConnected(): boolean {
    return Boolean(this.token && Date.now() < this.expiresAt - 60_000);
  }

  async connect(interactive = true): Promise<void> {
    if (!this.isConfigured()) throw new DriveError('Google Drive is not configured. Set VITE_GOOGLE_CLIENT_ID and rebuild the app.');
    if (this.isConnected()) return;
    await loadGis();
    const oauth2 = window.google!.accounts.oauth2;
    if (!this.client || this.clientScope !== this.scopeUrl) {
      this.clientScope = this.scopeUrl;
      this.client = oauth2.initTokenClient({ client_id: env.googleClientId, scope: this.scopeUrl, callback: () => undefined });
    }
    const client = this.client;
    await new Promise<void>((resolve, reject) => {
      client.callback = (r) => {
        if (r.error || !r.access_token) {
          reject(new DriveError(r.error_description || r.error || 'Google authorisation was cancelled.'));
          return;
        }
        this.token = r.access_token;
        this.expiresAt = Date.now() + (r.expires_in ?? 3600) * 1000;
        resolve();
      };
      try {
        // An empty prompt re-uses an existing grant without showing the consent screen again.
        client.requestAccessToken({ prompt: interactive ? '' : 'none' });
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect(): void {
    if (this.token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(this.token);
    this.token = null;
    this.expiresAt = 0;
    this.folderCache.clear();
  }

  private async request(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    await this.connect();
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token}` } });
    if (res.status === 401 && retry) {
      this.token = null;
      await this.connect();
      return this.request(url, init, false);
    }
    if (!res.ok) {
      let msg = `Google Drive error ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body.error?.message) msg = `Google Drive: ${body.error.message}`;
      } catch {
        /* not JSON */
      }
      if (res.status === 404) msg = 'The file was not found in Google Drive or you do not have access to it.';
      throw new DriveError(msg, res.status);
    }
    return res;
  }

  private async findFolder(name: string, parentId: string | null): Promise<string | null> {
    const q = [`mimeType='${FOLDER_MIME}'`, `name='${escapeQ(name)}'`, 'trashed=false', parentId ? `'${escapeQ(parentId)}' in parents` : null]
      .filter(Boolean)
      .join(' and ');
    const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    const res = await this.request(`${DRIVE}/files?${params}`);
    const body = (await res.json()) as { files: { id: string }[] };
    return body.files[0]?.id ?? null;
  }

  private async createFolder(name: string, parentId: string | null): Promise<string> {
    const res = await this.request(`${DRIVE}/files?supportsAllDrives=true&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
    });
    return ((await res.json()) as { id: string }).id;
  }

  private async findOrCreateFolder(name: string, parentId: string | null): Promise<string> {
    const key = `${parentId ?? 'root'}/${name}`;
    const cached = this.folderCache.get(key);
    if (cached) return cached;
    const id = (await this.findFolder(name, parentId)) ?? (await this.createFolder(name, parentId));
    this.folderCache.set(key, id);
    return id;
  }

  /**
   * Shipment folder inside the configured company folder (or, when none is
   * configured, inside an app-created "Diamond Dent Shipments" folder).
   */
  async ensureShipmentFolder(folderName: string): Promise<string> {
    const root = this.config.rootFolderId || (await this.findOrCreateFolder(this.config.rootFolderName, null));
    return this.findOrCreateFolder(folderName, root);
  }

  /** Verifies the configured folder is reachable with the current Google account. */
  async checkRootFolder(): Promise<{ id: string; name: string }> {
    if (!this.config.rootFolderId) throw new DriveError('No Drive folder is configured.');
    const res = await this.request(`${DRIVE}/files/${encodeURIComponent(this.config.rootFolderId)}?fields=id,name,mimeType&supportsAllDrives=true`);
    const f = (await res.json()) as { id: string; name: string; mimeType: string };
    if (f.mimeType !== FOLDER_MIME) throw new DriveError('The configured link is not a folder.');
    return { id: f.id, name: f.name };
  }

  async upload(file: Blob, fileName: string, folderId: string, mimeType?: string): Promise<StoredFile> {
    const boundary = `dd-${Math.random().toString(36).slice(2)}`;
    const type = mimeType || file.type || 'application/octet-stream';
    const metadata = { name: fileName, parents: [folderId], mimeType: type };
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
        file,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    );
    const res = await this.request(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const f = (await res.json()) as { id: string; name: string; mimeType: string; size?: string; webViewLink?: string };
    return { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : file.size, webViewLink: f.webViewLink ?? null, folderId };
  }

  async download(fileId: string): Promise<Blob> {
    const res = await this.request(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    return res.blob();
  }

  /** Moves the file to the Drive trash (recoverable for 30 days). */
  async remove(fileId: string): Promise<void> {
    try {
      await this.request(`${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    } catch (e) {
      // already gone in Drive: still allow the record to be removed
      if (e instanceof DriveError && e.status === 404) return;
      throw e;
    }
  }
}

export const googleDrive = new GoogleDriveStorage();
export const documentStorage: DocumentStorage = googleDrive;

// ---------------------------------------------------------------------------
// Naming helpers (pure; used by the documents service)
// ---------------------------------------------------------------------------
/**
 * Extracts a Drive folder ID from a pasted link or a bare ID. Accepts e.g.
 *   https://drive.google.com/drive/folders/<id>
 *   https://drive.google.com/drive/u/0/folders/<id>?usp=sharing
 *   https://drive.google.com/open?id=<id>
 * Returns null when nothing ID-like is found.
 */
export function parseDriveFolderId(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

export function shipmentFolderName(poNumber: string | null, shipmentCode: string): string {
  const po = (poNumber ?? '').trim() || 'No PO';
  return `${po} – ${shipmentCode}`.replace(/[\\/]/g, '-');
}

export function documentFileName(docNo: string, docTypeLabel: string, originalName: string): string {
  const ext = (originalName.split('.').pop() ?? '').toLowerCase();
  return `${docNo}_${docTypeLabel}${ext && ext !== originalName.toLowerCase() ? `.${ext}` : ''}`;
}

export function zipFileName(poNumber: string | null, shipmentCode: string): string {
  const po = (poNumber ?? '').trim() || 'NO-PO';
  return `${po}_${shipmentCode}_Documents.zip`.replace(/[\\/:*?"<>|\s]+/g, '-');
}
