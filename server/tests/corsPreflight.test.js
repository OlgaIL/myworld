import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import cors from "cors";
import express from "express";
import { buildCorsOptions } from "../middleware/corsOptions.js";

test("CORS preflight allows the upload attempt header", async () => {
  const app = express();
  app.use(cors(buildCorsOptions("https://word2you.ru")));
  app.post("/api/guest/upload", (req, res) => res.sendStatus(200));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.request({
        host: "127.0.0.1",
        port: server.address().port,
        path: "/api/guest/upload",
        method: "OPTIONS",
        headers: {
          Origin: "https://word2you.ru",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,x-upload-attempt-id"
        }
      }, (result) => {
        result.resume();
        result.on("end", () => resolve(result));
      });

      request.once("error", reject);
      request.end();
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "https://word2you.ru");
    assert.match(response.headers["access-control-allow-methods"], /POST/);
    assert.match(response.headers["access-control-allow-headers"], /x-upload-attempt-id/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
