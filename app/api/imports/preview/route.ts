import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgContext } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';
import { IMPORT_TYPES } from '@/lib/domain/csv';
import { previewCsvImport } from '@/lib/services/imports';

const PreviewSchema = z.object({
  importType: z.enum(IMPORT_TYPES),
  csvText: z.string().min(1),
  columnMapping: z.record(z.string(), z.string()).default({}),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext('imports:commit');
    const body = PreviewSchema.parse(await req.json());
    const result = previewCsvImport(
      ctx.organization.id,
      body.importType,
      body.csvText,
      body.columnMapping
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
