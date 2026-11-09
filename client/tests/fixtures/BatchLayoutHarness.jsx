// DEV-only visual fixture. Every API call is handled in memory.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import { AuthProvider } from "../../src/contexts/AuthContext";
import App from "../../src/pages/App";
import "../../src/index.css";

if (!import.meta.env.DEV) throw Error("DEV_ONLY_HARNESS");
const user = { id: "synthetic-batch-layout", displayName: "Учебный аккаунт", recordLimit: 10, recordsUsed: 1,
  packageRemaining: 9, processingAllowed: true, recordUploadAllowed: true,
  legalVersion: "2026-07-15", legalAcceptedAt: "2026-11-08" };
const empty = new URLSearchParams(location.search).get("empty") === "1";
axios.defaults.adapter = async config => {
  const path = new URL(config.url, location.origin).pathname;
  let data;
  if (path === "/api/me") data = empty ? { ...user, recordsUsed: 0 } : user;
  else if (path === "/api/photos-metadata" && empty) data = [];
  else if (path === "/api/photos-metadata") data = [{ name: "synthetic-batch-layout.jpg", displayTitle: "Учебная запись", status: "processed", cleanText: "Учебный текст", createdAt: "2026-11-08T09:00:00Z" }];
  else if (path === "/api/auth-providers" || path === "/api/improvement-requests") data = [];
  else if (path === "/api/guest/document") data = { documents: [] };
  else if (path === "/api/analytics/identity") data = { ok: true };
  else throw Error(`UNMOCKED_REQUEST: ${path}`);
  return { data, status: 200, statusText: "OK", headers: {}, config };
};
createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={[empty ? "/" : "/?intent=batch&placement=batch_hero"]}>
    <AuthProvider><App /></AuthProvider>
  </MemoryRouter>
);
