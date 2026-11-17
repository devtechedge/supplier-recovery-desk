import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
  'text/plain',
]);

export const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function sanitizeFileName(rawName: string): string {
  const base = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(0, 120) || 'evidence-file';
}

export function validateEvidenceFile(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): { safeName: string } {
  if (params.sizeBytes <= 0 || params.sizeBytes > MAX_EVIDENCE_SIZE_BYTES) {
    throw new Error('Evidence file size must be between 1 byte and 10 MB.');
  }
  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(params.mimeType)) {
    throw new Error(`Unsupported file type "${params.mimeType}". Allowed: PDF, PNG, JPEG, WEBP, CSV, TXT.`);
  }
  return { safeName: sanitizeFileName(params.fileName) };
}

function getStorageRoot(): string {
  const cwdEvidence = path.join(process.cwd(), '.data', 'evidence');
  try {
    fs.mkdirSync(cwdEvidence, { recursive: true });
    return cwdEvidence;
  } catch {
    return path.join(os.tmpdir(), 'srd-evidence');
  }
}

function isSupabaseStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  );
}

export async function storeEvidencePrivate(params: {
  organizationId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storagePath: string; safeName: string }> {
  const { safeName } = validateEvidenceFile({
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.buffer.byteLength,
  });

  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
  const storagePath = `${params.organizationId}/${uniqueName}`;

  if (isSupabaseStorageConfigured()) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.storage
      .from('recovery-evidence')
      .upload(storagePath, params.buffer, {
        contentType: params.mimeType,
        upsert: false,
      });
    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }
    return { storagePath, safeName };
  }

  const orgDir = path.join(getStorageRoot(), params.organizationId);
  if (!fs.existsSync(orgDir)) {
    fs.mkdirSync(orgDir, { recursive: true });
  }
  const resolved = path.resolve(getStorageRoot(), storagePath);
  if (!resolved.startsWith(path.resolve(getStorageRoot()))) {
    throw new Error('Invalid storage path traversal attempt');
  }
  fs.writeFileSync(resolved, params.buffer);
  return { storagePath, safeName };
}

function getSigningSecret(): string {
  return (
    process.env.AUTH_SESSION_SECRET ||
    'dev-only-supplier-recovery-desk-evidence-signing-secret'
  );
}

export function createSignedEvidenceToken(params: {
  evidenceId: string;
  organizationId: string;
  expiresInSeconds?: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + (params.expiresInSeconds ?? 300);
  const payload = `${params.evidenceId}:${params.organizationId}:${exp}`;
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifySignedEvidenceToken(token: string): {
  evidenceId: string;
  organizationId: string;
} | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [evidenceId, organizationId, expStr, sig] = decoded.split(':');
    if (!evidenceId || !organizationId || !expStr || !sig) return null;
    const exp = Number.parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return null;
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(`${evidenceId}:${organizationId}:${expStr}`)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    return { evidenceId, organizationId };
  } catch {
    return null;
  }
}

export async function readEvidencePrivate(storagePath: string): Promise<Buffer> {
  if (isSupabaseStorageConfigured()) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await supabase.storage
      .from('recovery-evidence')
      .download(storagePath);
    if (error || !data) {
      throw new Error('Unable to read private evidence from Supabase Storage');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  const root = path.resolve(getStorageRoot());
  const target = path.resolve(root, storagePath);
  if (!target.startsWith(root) || !fs.existsSync(target)) {
    throw new Error('Evidence file not found in private storage');
  }
  return fs.readFileSync(target);
}
