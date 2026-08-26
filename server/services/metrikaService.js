import axios from "axios";
import {
  YANDEX_METRIKA_API_ENABLED,
  YANDEX_METRIKA_COUNTER_ID,
  YANDEX_METRIKA_VISITS_START_DATE
} from "../config/env.js";
import { YANDEX_METRIKA_API_TOKEN } from "../config/private-env.js";

const METRIKA_REPORT_URL = "https://api-metrika.yandex.net/stat/v1/data";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CLIENT_IDS_PER_REQUEST = 100;
const visitsCache = new Map();

function normalizeClientIds(clientIds) {
  return [...new Set(
    (Array.isArray(clientIds) ? clientIds : [])
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d{1,64}$/.test(value))
  )];
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export function buildMetrikaVisitsRequest(clientIds, {
  counterId = YANDEX_METRIKA_COUNTER_ID,
  date1 = YANDEX_METRIKA_VISITS_START_DATE
} = {}) {
  const normalizedIds = normalizeClientIds(clientIds);

  return {
    url: METRIKA_REPORT_URL,
    params: {
      ids: counterId,
      metrics: "ym:s:visits",
      dimensions: "ym:s:clientID",
      filters: `ym:s:clientID=.(${normalizedIds.map((id) => `'${id}'`).join(",")})`,
      date1,
      date2: "today",
      accuracy: "full",
      limit: Math.max(normalizedIds.length, 1)
    }
  };
}

export function parseMetrikaVisitsResponse(data, requestedClientIds) {
  const visitsByClientId = Object.fromEntries(normalizeClientIds(requestedClientIds).map((id) => [id, 0]));

  for (const row of data?.data || []) {
    const clientId = String(row?.dimensions?.[0]?.name || "").trim();

    if (Object.hasOwn(visitsByClientId, clientId)) {
      visitsByClientId[clientId] = Math.max(0, Number(row?.metrics?.[0] || 0));
    }
  }

  return visitsByClientId;
}

export async function fetchMetrikaVisitsByClientIds(clientIds, {
  enabled = YANDEX_METRIKA_API_ENABLED,
  counterId = YANDEX_METRIKA_COUNTER_ID,
  date1 = YANDEX_METRIKA_VISITS_START_DATE,
  oauthToken = YANDEX_METRIKA_API_TOKEN,
  httpClient = axios
} = {}) {
  const normalizedIds = normalizeClientIds(clientIds);

  if (!enabled) {
    return { status: "disabled", periodStart: date1, visitsByClientId: {} };
  }

  if (!counterId || !oauthToken) {
    return { status: "not_configured", periodStart: date1, visitsByClientId: {} };
  }

  if (normalizedIds.length === 0) {
    return { status: "ok", periodStart: date1, visitsByClientId: {} };
  }

  try {
    const visitsByClientId = {};

    for (const clientIdsBatch of chunk(normalizedIds, MAX_CLIENT_IDS_PER_REQUEST)) {
      const request = buildMetrikaVisitsRequest(clientIdsBatch, { counterId, date1 });
      const response = await httpClient.get(request.url, {
        params: request.params,
        headers: { Authorization: `OAuth ${oauthToken}` },
        timeout: 5000
      });
      Object.assign(visitsByClientId, parseMetrikaVisitsResponse(response.data, clientIdsBatch));
    }

    return { status: "ok", periodStart: date1, visitsByClientId };
  } catch (error) {
    console.warn("YANDEX METRIKA API ERROR:", {
      status: error.response?.status || null,
      message: error.message
    });
    return { status: "unavailable", periodStart: date1, visitsByClientId: {} };
  }
}

export async function getMetrikaVisitsByClientIds(clientIds) {
  const normalizedIds = normalizeClientIds(clientIds);
  const now = Date.now();
  const cachedVisits = {};
  const missingIds = [];

  for (const clientId of normalizedIds) {
    const cached = visitsCache.get(clientId);

    if (cached && cached.expiresAt > now) {
      cachedVisits[clientId] = cached.visits;
    } else {
      missingIds.push(clientId);
    }
  }

  const fetched = await fetchMetrikaVisitsByClientIds(missingIds);

  if (fetched.status !== "ok") {
    return fetched;
  }

  for (const [clientId, visits] of Object.entries(fetched.visitsByClientId)) {
    visitsCache.set(clientId, { visits, expiresAt: now + CACHE_TTL_MS });
  }

  return {
    status: "ok",
    periodStart: fetched.periodStart,
    visitsByClientId: { ...cachedVisits, ...fetched.visitsByClientId }
  };
}

export function clearMetrikaVisitsCache() {
  visitsCache.clear();
}
