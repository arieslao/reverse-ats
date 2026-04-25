// Resend transactional email — used for sign-in codes.
// Free tier: 3,000 emails/month, 100/day. Plenty for the test phase.

const RESEND_API = "https://api.resend.com/emails";
const FROM_ADDRESS = "Reverse ATS <reverse-ats@arieslabs.ai>";

export interface SendCodeResult {
  ok: boolean;
  error?: string;
}

export async function sendSignInCode(
  apiKey: string,
  toEmail: string,
  code: string,
): Promise<SendCodeResult> {
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const subject = `Your Reverse ATS sign-in code: ${code}`;
  const text = [
    `Your sign-in code is: ${code}`,
    ``,
    `Enter it on the sign-in page to access your account.`,
    `This code expires in 10 minutes and can only be used once.`,
    ``,
    `If you didn't request this, you can safely ignore this email.`,
    ``,
    `— Reverse ATS`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1814;">
      <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 24px;">Your sign-in code</h1>
      <div style="background: #fbf9f4; border: 1px solid #e8e3d8; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 36px; font-weight: 600; letter-spacing: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${code}</div>
      </div>
      <p style="font-size: 14px; line-height: 1.5; color: #5b554a; margin: 0 0 12px;">
        Enter this code on the sign-in page. It expires in 10 minutes and can only be used once.
      </p>
      <p style="font-size: 13px; color: #8a8472; margin: 24px 0 0;">
        If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e8e3d8; margin: 32px 0 16px;">
      <p style="font-size: 12px; color: #8a8472; margin: 0;">Reverse ATS · <a href="https://reverse-ats.app" style="color: #8a8472;">reverse-ats.app</a></p>
    </div>
  `.trim();

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `resend ${res.status}: ${errBody.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
