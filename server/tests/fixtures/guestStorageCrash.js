import fs from "node:fs/promises";
import express from "express";

// Only launched by the local synthetic-schema suite. No API credentials.
const database = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
  || !database.searchParams.get("options")?.includes("storage_test_")) throw new Error("LOCAL_TEST_SCHEMA_REQUIRED");
globalThis.__myworldEnvLoaded = true;
const pause = async (data) => {
  process.send(data);
  await new Promise(() => {});
};
const mode = process.argv[2];
if (mode === "http") {
  const app = express();
  app.use((await import("../../routes/guestRoutes.js")).default);
  const server = app.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));
} else {
  const { acquireGuestStorageLock } = await import("../../services/guestStorageLocks.js");
  const { transferGuestDocument } = await import("../../services/guestStorageService.js");
  const { durableCopy } = await import("../../services/guestStorageFiles.js");
  const { query } = await import("../../db/index.js");
  const [documentId, userId, sessionId] = process.argv.slice(3);
  await acquireGuestStorageLock(sessionId);
  if (mode === "temporary") fs.copyFile = async (_source, temporary) => {
    await fs.writeFile(temporary, "synthetic partial copy", { flag: "wx" });
    await pause({ temporary });
  };
  await transferGuestDocument(documentId, userId, { copy: async (...args) => {
    await durableCopy(...args);
    const intent = (await query("select * from guest_file_intents where guest_document_id = $1", [documentId])).rows[0];
    await pause({ destination: args[1], intent });
  } });
}
