import { CLIENT_URL } from "../config/env.js";

export function buildCorsOptions(clientUrl = CLIENT_URL) {
  const allowedOrigins = new Set(
    [clientUrl, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean)
  );

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, origin || true);
      }

      return callback(null, false);
    },
    credentials: true
  };
}
