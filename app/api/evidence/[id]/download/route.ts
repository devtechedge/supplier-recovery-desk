import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { readEvidencePrivate, verifySignedEvidenceToken } from '@/lib/storage/evidence-storage';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('evidence:read');
    const { id } = await context.params;
    const token = req.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Signed access token required' }, { status: 403 });
    }

    const verified = verifySignedEvidenceToken(token);
    if (
      !verified ||
      verified.evidenceId !== id ||
      verified.organizationId !== ctx.organization.id
    ) {
      return NextResponse.json({ error: 'Invalid or expired evidence token' }, { status: 403 });
    }

    const db = getDb();
    const row = db
      .prepare('SELECT file_name, mime_type, storage_path FROM recovery_evidence WHERE id = ? AND organization_id = ?')
      .get(id, ctx.organization.id) as
      | { file_name: string; mime_type: string; storage_path: string }
      | undefined;

    if (!row) {
      return NextResponse.json({ error: 'Evidence record not found' }, { status: 404 });
    }

    const fileBuffer = await readEvidencePrivate(row.storage_path);
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': row.mime_type,
        'Content-Disposition': `attachment; filename="${row.file_name}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
