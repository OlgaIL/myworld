import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import guestRoutes from "../routes/guestRoutes.js";

async function withGuestServer(run) {
  const app = express();
  app.use(guestRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    return await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function requestNoFile(port, attemptId) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/guest/upload?yclid=private",
      method: "POST",
      headers: {
        "X-Upload-Attempt-ID": attemptId,
        "Content-Type": "multipart/form-data; boundary=diagnostic",
        "Cookie": "guest_session=private-cookie",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) YaBrowser/26"
      }
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response));
    });

    request.once("error", reject);
    request.end();
  });
}

test("guest upload returns the same attempt ID and avoids private request values in logs", async () => {
  const originalInfo = console.info;
  const logs = [];
  console.info = (...parts) => logs.push(parts.join(" "));

  try {
    await withGuestServer(async (port) => {
      const response = await requestNoFile(port, "2a97e934-5c41-45b5-aadb-0ab39d4c2a35");
      assert.equal(response.statusCode, 500);
      assert.equal(response.headers["x-upload-attempt-id"], "2a97e934-5c41-45b5-aadb-0ab39d4c2a35");
    });
  } finally {
    console.info = originalInfo;
  }

  const output = logs.join("\n");
  assert.match(output, /upload_request_received/);
  assert.match(output, /"uploadAttemptId":"2a97e934-5c41-45b5-aadb-0ab39d4c2a35"/);
  assert.doesNotMatch(output, /private-cookie|yclid=private/);
});

test("guest upload logs an aborted request before multer finishes", async () => {
  const originalInfo = console.info;
  const logs = [];
  console.info = (...parts) => logs.push(parts.join(" "));

  try {
    await withGuestServer(async (port) => {
      await new Promise((resolve) => {
        const request = http.request({
          host: "127.0.0.1",
          port,
          path: "/api/guest/upload",
          method: "POST",
          headers: {
            "X-Upload-Attempt-ID": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
            "Content-Type": "multipart/form-data; boundary=diagnostic",
            "Content-Length": "100"
          }
        });

        request.on("error", () => {});
        request.on("socket", (socket) => {
          socket.once("connect", () => {
            request.write("--diagnostic\r\nContent-Disposition: form-data; name=\"photo\"");
            setTimeout(() => request.destroy(), 25);
          });
        });
        setTimeout(resolve, 180);
      });
    });
  } finally {
    console.info = originalInfo;
  }

  assert.match(logs.join("\n"), /upload_request_aborted/);
});
