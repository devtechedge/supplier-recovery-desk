import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';

export async function GET() {
  try {
    const ctx = await requireOrgContext('reports:export');
    const db = getDb();
    const orgId = ctx.organization.id;

    const payload = {
      exportedAt: new Date().toISOString(),
      organization: db.prepare('SELECT id, name, slug, default_currency, is_demo FROM organizations WHERE id = ?').get(orgId),
      suppliers: db.prepare('SELECT * FROM suppliers WHERE organization_id = ?').all(orgId),
      recoveryCases: db.prepare('SELECT * FROM recovery_cases WHERE organization_id = ?').all(orgId),
      costItems: db.prepare('SELECT * FROM loss_cost_items WHERE organization_id = ?').all(orgId),
      settlements: db.prepare('SELECT * FROM recovery_settlements WHERE organization_id = ?').all(orgId),
      transactions: db.prepare('SELECT * FROM recovery_transactions WHERE organization_id = ?').all(orgId),
      auditLogs: db.prepare('SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 250').all(orgId),
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${ctx.organization.slug}-data-export.json"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
