import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { storeEvidencePrivate } from '@/lib/storage/evidence-storage';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('evidence:upload');
    const { id: caseId } = await context.params;
    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM recovery_cases WHERE id = ? AND organization_id = ?')
      .get(caseId, ctx.organization.id);
    if (!existing) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const title = String(formData.get('title') ?? '').trim();
    const evidenceType = String(formData.get('evidenceType') ?? 'other').trim();
    const checklistItemKey = String(formData.get('checklistItemKey') ?? '').trim() || null;
    const notes = String(formData.get('notes') ?? '').trim() || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A valid file upload is required.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const stored = await storeEvidencePrivate({
      organizationId: ctx.organization.id,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      buffer,
    });

    const evidenceId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO recovery_evidence (
        id, organization_id, case_id, checklist_item_key, title, evidence_type,
        file_name, mime_type, file_size_bytes, storage_path, is_completed, uploaded_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      evidenceId,
      ctx.organization.id,
      caseId,
      checklistItemKey,
      title || stored.safeName,
      evidenceType,
      stored.safeName,
      file.type || 'application/octet-stream',
      buffer.byteLength,
      stored.storagePath,
      ctx.user.id,
      notes
    );

    db.prepare(
      `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
       VALUES (?, ?, ?, ?, 'evidence_uploaded', ?)`
    ).run(
      crypto.randomUUID(),
      ctx.organization.id,
      caseId,
      ctx.user.id,
      `Uploaded private evidence "${title || stored.safeName}" (${stored.safeName}).`
    );

    return NextResponse.json({ id: evidenceId, fileName: stored.safeName }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
