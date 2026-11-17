import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';

const TaskSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    title: z.string().min(2),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  }),
  z.object({
    action: z.literal('toggle'),
    taskId: z.string().uuid(),
    isCompleted: z.boolean(),
  }),
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext('cases:edit');
    const { id: caseId } = await context.params;
    const body = TaskSchema.parse(await req.json());
    const db = getDb();

    if (body.action === 'create') {
      const taskId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO recovery_tasks (id, organization_id, case_id, title, assigned_to, due_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(taskId, ctx.organization.id, caseId, body.title.trim(), ctx.user.id, body.dueDate || null);
      return NextResponse.json({ id: taskId }, { status: 201 });
    }

    db.prepare(
      `UPDATE recovery_tasks
       SET is_completed = ?, completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
       WHERE id = ? AND case_id = ? AND organization_id = ?`
    ).run(body.isCompleted ? 1 : 0, body.isCompleted ? 1 : 0, body.taskId, caseId, ctx.organization.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
