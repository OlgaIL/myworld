import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatEventNotification,
  sendTelegramMessage,
  startTelegramNotificationWorker
} from "../services/telegramNotificationsService.js";

test("formats only safe event details and reminds about the receipt", () => {
  assert.equal(
    formatEventNotification({ event_type: "user_registered", entity_id: 41 }, { email: "new@example.test" }),
    "Новая регистрация\nПользователь: new@example.test"
  );
  assert.match(
    formatEventNotification({ event_type: "payment_succeeded", entity_id: 9 }, {
      email: "buyer@example.test", packageTitle: "Старт", amountValue: "99.00", currency: "RUB"
    }),
    /Отправьте чек\.\nПользователь: buyer@example\.test\nПакет: Старт\nСумма: 99\.00 RUB/
  );
  assert.match(
    formatEventNotification({ event_type: "improvement_requested", entity_id: 7 }),
    /заявка на улучшение №7/
  );
  assert.equal(
    formatEventNotification({ event_type: "user_registered", entity_id: 41 }, { email: "new@example.test\nСбой сайта" }),
    "Новая регистрация\nПользователь: new@example.test Сбой сайта"
  );
});

test("event messages are sent silently to the configured chat", async () => {
  let requestedUrl;
  let body;
  await sendTelegramMessage({
    token: "test-token",
    chatId: "-100123",
    text: "Новая регистрация",
    silent: true,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });
  assert.equal(requestedUrl, "https://api.telegram.org/bottest-token/sendMessage");
  assert.deepEqual(body, {
    chat_id: "-100123",
    text: "Новая регистрация",
    disable_notification: true
  });
});

test("Telegram rejection is treated as failed delivery", async () => {
  await assert.rejects(
    sendTelegramMessage({
      token: "test-token",
      chatId: "123",
      text: "test",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) })
    }),
    /Telegram delivery failed/
  );
});

test("worker stays disabled without both credentials", () => {
  assert.equal(startTelegramNotificationWorker({ token: "", chatId: "-100123" }), null);
  assert.equal(startTelegramNotificationWorker({ token: "test-token", chatId: "" }), null);
});
