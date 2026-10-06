import "../config/load-env.js";
import { TELEGRAM_BOT_TOKEN } from "../config/private-env.js";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Set TELEGRAM_BOT_TOKEN in server/.env first.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`, {
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(`Telegram HTTP ${response.status}`);

    const chats = new Map();
    for (const update of result.result || []) {
      const chat = update.message?.chat || update.my_chat_member?.chat;
      if (chat?.id) chats.set(String(chat.id), chat.title || chat.username || chat.first_name || "Chat");
    }
    if (!chats.size) {
      console.log("No chats found. Send /start to the bot in each chat, then retry.");
    } else {
      for (const [id, title] of chats) console.log(`${title}: ${id}`);
    }
  } catch (error) {
    console.error("Could not read Telegram chats:", error.message);
    process.exitCode = 1;
  }
}
