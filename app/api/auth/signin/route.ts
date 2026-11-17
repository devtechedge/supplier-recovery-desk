import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateWithPassword, setSessionCookies } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = SignInSchema.parse(await req.json());
    const { userId, defaultOrgId } = authenticateWithPassword(body.email, body.password);
    await setSessionCookies(userId, defaultOrgId);
    return NextResponse.json({ ok: true, organizationId: defaultOrgId });
  } catch (err) {
    return handleApiError(err);
  }
}
