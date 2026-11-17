import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { registerUserWithOrganization, setSessionCookies } from '@/lib/auth/session';
import { handleApiError } from '@/lib/api/http';

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2),
  organizationName: z.string().min(2),
  jobTitle: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = SignUpSchema.parse(await req.json());
    const { userId, organizationId } = registerUserWithOrganization(body);
    await setSessionCookies(userId, organizationId);
    return NextResponse.json({ ok: true, organizationId }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
