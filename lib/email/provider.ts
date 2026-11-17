export interface EmailSendResult {
  sent: boolean;
  provider: 'resend' | 'draft_only';
  messageId?: string;
  note: string;
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      !process.env.RESEND_API_KEY.includes('your_resend_api_key') &&
      process.env.RESEND_FROM_EMAIL &&
      !process.env.RESEND_FROM_EMAIL.includes('your-verified-domain')
  );
}

export async function sendApprovedSupplierEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailSendResult> {
  if (!isEmailProviderConfigured()) {
    return {
      sent: false,
      provider: 'draft_only',
      note: 'Transactional email provider (Resend) is not configured. Draft was approved and saved for clipboard/EML export.',
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      text: params.body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Email provider rejected delivery: ${errText}`);
  }

  const data = (await res.json()) as { id?: string };
  return {
    sent: true,
    provider: 'resend',
    messageId: data.id,
    note: 'Email dispatched via Resend after explicit human approval.',
  };
}
