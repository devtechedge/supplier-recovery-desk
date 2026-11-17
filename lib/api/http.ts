import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth/session';

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 }
    );
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
