import { query, withTransaction } from "../db/index.js";

const POLL_INTERVAL_MS = 15000;

function singleLine(value, maxLength = 120) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

export function formatEventNotification(event, details = {}) {
  const user = singleLine(details.email) || `ID ${details.userId || event.entity_id}`;

  switch (event.event_type) {
    case "user_registered":
      return `Новая регистрация\nПользователь: ${user}`;
    case "payment_succeeded":
      return [
        "Оплата подтверждена. Отправьте чек.",
        `Пользователь: ${user}`,
        `Пакет: ${singleLine(details.packageTitle) || "—"}`,
        `Сумма: ${details.amountValue || "—"} ${singleLine(details.currency) || "RUB"}`,
        `Платёж: ${event.entity_id}`
      ].join("\n");
    case "improvement_requested":
      return `Новая заявка на улучшение №${event.entity_id}\nПользователь: ${user}`;
    default:
      throw new Error("Unknown notification event");
  }
}

export async function sendTelegramMessage({ token, chatId, text, silent = false, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_notification: silent }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok || !(await response.json()).ok) {
    throw new Error(`Telegram delivery failed (HTTP ${response.status})`);
  }
}

async function claimPendingEvent() {
  return withTransaction(async (client) => {
    const result = await client.query(`
      with pending as (
        select id from notification_outbox
        where sent_at is null and next_attempt_at <= now()
        order by id
        for update skip locked
        limit 1
      )
      update notification_outbox n
      set attempts = attempts + 1,
          next_attempt_at = now() + interval '2 minutes'
      from pending
      where n.id = pending.id
      returning n.*
    `);
    return result.rows[0] || null;
  });
}

async function loadEventDetails(event) {
  if (event.event_type === "user_registered") {
    const result = await query("select id as user_id, email from users where id = $1", [event.entity_id]);
    return { userId: result.rows[0]?.user_id, email: result.rows[0]?.email };
  }
  if (event.event_type === "payment_succeeded") {
    const result = await query(`
      select p.user_id, u.email, p.package_title, p.amount_value, p.currency
      from payments p left join users u on u.id = p.user_id
      where p.id = $1
    `, [event.entity_id]);
    const row = result.rows[0];
    return {
      userId: row?.user_id,
      email: row?.email,
      packageTitle: row?.package_title,
      amountValue: row?.amount_value,
      currency: row?.currency
    };
  }
  const result = await query(`
    select r.user_id, u.email
    from recognition_improvement_requests r left join users u on u.id = r.user_id
    where r.id = $1
  `, [event.entity_id]);
  return { userId: result.rows[0]?.user_id, email: result.rows[0]?.email };
}

export async function deliverPendingEvent({ token, chatId, send = sendTelegramMessage } = {}) {
  const event = await claimPendingEvent();
  if (!event) return false;

  try {
    const details = await loadEventDetails(event);
    await send({ token, chatId, text: formatEventNotification(event, details), silent: true });
    await query("update notification_outbox set sent_at = now(), last_error = null where id = $1", [event.id]);
  } catch (error) {
    const delayMinutes = Math.min(60, 2 ** Math.min(event.attempts, 6));
    await query(`
      update notification_outbox
      set next_attempt_at = now() + ($2::int * interval '1 minute'),
          last_error = $3
      where id = $1
    `, [event.id, delayMinutes, String(error?.message || "UNKNOWN").slice(0, 160)]);
    console.error("[telegram-notifications] delivery failed", {
      eventType: event.event_type,
      eventId: event.id,
      attempt: event.attempts,
      error: error?.message || "UNKNOWN"
    });
  }
  return true;
}

export function startTelegramNotificationWorker({ token, chatId } = {}) {
  if (!token || !chatId) return null;

  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (let index = 0; index < 10; index += 1) {
        if (!(await deliverPendingEvent({ token, chatId }))) break;
      }
    } catch (error) {
      console.error("[telegram-notifications] worker failed", { code: error?.code || "UNKNOWN" });
    } finally {
      running = false;
    }
  }, POLL_INTERVAL_MS);
  timer.unref();
  return timer;
}
