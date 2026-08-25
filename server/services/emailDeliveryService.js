import nodemailer from "nodemailer";
import {
  CLIENT_URL,
  IMPROVEMENT_NOTIFICATION_EMAIL,
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER
} from "../config/env.js";
import { SMTP_PASSWORD } from "../config/private-env.js";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  return transporter;
}

export async function sendEmailLoginCode({ email, code, ttlMinutes = 10 }) {
  await getTransporter().sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Код для входа в Word2you",
    text: `Ваш код для входа в Word2you: ${code}\n\nКод действует ${ttlMinutes} минут. Если вы не запрашивали код, просто игнорируйте это письмо.`,
    html: `
      <p>Ваш код для входа в Word2you:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
      <p>Код действует ${ttlMinutes} минут.</p>
      <p>Если вы не запрашивали код, просто игнорируйте это письмо.</p>
      <p>https://word2you.ru/</p>

    `
  });
}

export async function sendImprovementRequestNotification({ requestId, documentTitle = "Запись" }) {
  if (!IMPROVEMENT_NOTIFICATION_EMAIL) {
    return false;
  }

  const adminUrl = `${String(CLIENT_URL || "https://word2you.ru").replace(/\/$/, "")}/admin-control`;
  await getTransporter().sendMail({
    from: SMTP_FROM,
    to: IMPROVEMENT_NOTIFICATION_EMAIL,
    subject: `Новый запрос на улучшение №${requestId}`,
    text: [
      `Получен новый запрос на улучшение №${requestId}.`,
      `Документ: ${documentTitle || "Запись"}.`,
      `Открыть очередь: ${adminUrl}`
    ].join("\n")
  });

  return true;
}
