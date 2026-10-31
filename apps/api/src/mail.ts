export interface Mailer { send(to: string[], subject: string, text: string): Promise<void> }
export const MAILER = Symbol('MAILER');

export function resendMailer(): Mailer {
  return {
    async send(to, subject, text) {
      const key = process.env.RESEND_API_KEY;
      if (!key || !to.length) return;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, reply_to: process.env.EMAIL_REPLY_TO, to, subject, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
    },
  };
}
