import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await context.params;
    const db = getDb();

    const supplier = db
      .prepare('SELECT * FROM suppliers WHERE id = ? AND organization_id = ?')
      .get(id, ctx.organization.id);
    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const contacts = db
      .prepare('SELECT * FROM supplier_contacts WHERE supplier_id = ? AND organization_id = ?')
      .all(id, ctx.organization.id);
    const terms = db
      .prepare('SELECT * FROM supplier_terms WHERE supplier_id = ? AND organization_id = ?')
      .all(id, ctx.organization.id);
    const cases = db
      .prepare(
        `SELECT * FROM recovery_cases WHERE supplier_id = ? AND organization_id = ? ORDER BY created_at DESC`
      )
      .all(id, ctx.organization.id);

    return NextResponse.json({ supplier, contacts, terms, cases });
  } catch (err) {
    return handleApiError(err);
  }
}
