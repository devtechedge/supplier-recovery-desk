import { NextRequest, NextResponse } from 'next/server';
import { CSV_TEMPLATES, IMPORT_TYPES, type ImportType } from '@/lib/domain/csv';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const { type } = await context.params;
  if (!IMPORT_TYPES.includes(type as ImportType)) {
    return NextResponse.json({ error: 'Unknown CSV template type' }, { status: 404 });
  }
  const spec = CSV_TEMPLATES[type as ImportType];
  return new NextResponse(spec.sampleCsv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="srd-template-${type}.csv"`,
    },
  });
}
