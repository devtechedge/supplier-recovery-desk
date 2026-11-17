import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { sendApprovedSupplierEmail } from '@/lib/email/provider';

const CommSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_draft'),
    recipientEmail: z.string().email().optional().or(z.literal('')),
    subject: z.string().min(3),
    body: z.string().min(10),
    isAiDrafted: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('log_inbound'),
    senderEmail: z.string().email().optional().or(z.literal('')),
    subject: z.string().min(3),
    body: z.string().min(5),
  }),
  z.object({
    action: z.literal('approve_and_send'),
    communicationId: z.string().uuid(),
    sendEmail: z.boolean().default(false),
  }),
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = CommSchema.parse(await req.json());
    const { id: caseId } = await context.params;
    const db = getDb();

    if (body.action === 'approve_and_send') {
      const ctx = await requireOrgContext('cases:submit');
      const comm = db
        .prepare('SELECT * FROM supplier_communications WHERE id = ? AND case_id = ? AND organization_id = ?')
        .get(body.communicationId, caseId, ctx.organization.id) as Record<string, unknown> | undefined;
      if (!comm) {
        return NextResponse.json({ error: 'Communication draft not found' }, { status: 404 });
      }

      let sendNote = 'Approved by user for manual clipboard/EML export.';
      let externalId: string | null = null;
      let direction = 'outbound_draft';
      let sentAt: string | null = null;

      if (body.sendEmail && comm.recipient_email) {
        const res = await sendApprovedSupplierEmail({
          to: String(comm.recipient_email),
          subject: String(comm.subject),
          body: String(comm.body),
        });
        sendNote = res.note;
        externalId = res.messageId ?? null;
        if (res.sent) {
          direction = 'outbound_sent';
          sentAt = new Date().toISOString();
        }
      }

      db.prepare(
        `UPDATE supplier_communications
         SET approved_by = ?, approved_at = datetime('now'),
             direction = ?, sent_at = COALESCE(?, sent_at), external_message_id = COALESCE(?, external_message_id)
         WHERE id = ? AND organization_id = ?`
      ).run(ctx.user.id, direction, sentAt, externalId, body.communicationId, ctx.organization.id);

      db.prepare(
        `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
         VALUES (?, ?, ?, ?, 'communication_approved', ?)`
      ).run(
        crypto.randomUUID(),
        ctx.organization.id,
        caseId,
        ctx.user.id,
        `Approved supplier communication "${String(comm.subject)}". ${sendNote}`
      );

      return NextResponse.json({ ok: true, note: sendNote, sent: Boolean(sentAt) });
    }

    const ctx = await requireOrgContext('cases:edit');
    const existingCase = db
      .prepare('SELECT id FROM recovery_cases WHERE id = ? AND organization_id = ?')
      .get(caseId, ctx.organization.id);
    if (!existingCase) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
    }

    const commId = crypto.randomUUID();
    if (body.action === 'save_draft') {
      db.prepare(
        `INSERT INTO supplier_communications (
          id, organization_id, case_id, direction, channel, recipient_email, subject, body, is_ai_drafted, created_by
        ) VALUES (?, ?, ?, 'outbound_draft', 'email', ?, ?, ?, ?, ?)`
      ).run(
        commId,
        ctx.organization.id,
        caseId,
        body.recipientEmail || null,
        body.subject.trim(),
        body.body.trim(),
        body.isAiDrafted ? 1 : 0,
        ctx.user.id
      );
      return NextResponse.json({ id: commId }, { status: 201 });
    }

    // log_inbound
    db.prepare(
      `INSERT INTO supplier_communications (
        id, organization_id, case_id, direction, channel, recipient_email, subject, body, sent_at, created_by
      ) VALUES (?, ?, ?, 'inbound_response', 'email', ?, ?, ?, datetime('now'), ?)`
    ).run(
      commId,
      ctx.organization.id,
      caseId,
      body.senderEmail || null,
      body.subject.trim(),
      body.body.trim(),
      ctx.user.id
    );

    db.prepare(
      `INSERT INTO claim_activity_events (id, organization_id, case_id, actor_user_id, event_type, summary)
       VALUES (?, ?, ?, ?, 'supplier_response_logged', ?)`
    ).run(
      crypto.randomUUID(),
      ctx.organization.id,
      caseId,
      ctx.user.id,
      `Logged inbound supplier response: "${body.subject.trim()}".`
    );

    return NextResponse.json({ id: commId }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
