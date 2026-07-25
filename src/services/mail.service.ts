import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export async function sendLeadEmail(subject: string, text: string): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS || !env.MAIL_TO) return;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
  await transporter.sendMail({ from: env.MAIL_FROM, to: env.MAIL_TO, subject, text });
}
