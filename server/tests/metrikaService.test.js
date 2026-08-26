import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetrikaVisitsRequest,
  fetchMetrikaVisitsByClientIds,
  parseMetrikaVisitsResponse
} from "../services/metrikaService.js";

test("builds a full-accuracy visits request with safe ClientIDs", () => {
  const request = buildMetrikaVisitsRequest(["123", "bad-id", "456", "123"], {
    counterId: "109386353",
    date1: "2026-01-01"
  });

  assert.equal(request.params.ids, "109386353");
  assert.equal(request.params.metrics, "ym:s:visits");
  assert.equal(request.params.dimensions, "ym:s:clientID");
  assert.equal(request.params.filters, "ym:s:clientID=.('123','456')");
  assert.equal(request.params.accuracy, "full");
  assert.equal(request.params.date1, "2026-01-01");
});

test("maps visits and keeps an explicit zero for a ClientID without visits", () => {
  const visits = parseMetrikaVisitsResponse({
    data: [
      { dimensions: [{ name: "123" }], metrics: [4] }
    ]
  }, ["123", "456"]);

  assert.deepEqual(visits, { 123: 4, 456: 0 });
});

test("uses OAuth without exposing the token and returns exact visit counts", async () => {
  let receivedOptions;
  const httpClient = {
    async get(url, options) {
      assert.equal(url, "https://api-metrika.yandex.net/stat/v1/data");
      receivedOptions = options;
      return {
        data: {
          data: [{ dimensions: [{ name: "987" }], metrics: [7] }]
        }
      };
    }
  };

  const result = await fetchMetrikaVisitsByClientIds(["987"], {
    enabled: true,
    counterId: "109386353",
    date1: "2026-01-01",
    oauthToken: "secret-token",
    httpClient
  });

  assert.equal(result.status, "ok");
  assert.equal(result.visitsByClientId[987], 7);
  assert.equal(receivedOptions.headers.Authorization, "OAuth secret-token");
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("does not break the admin flow when Metrika is unavailable", async () => {
  const result = await fetchMetrikaVisitsByClientIds(["987"], {
    enabled: true,
    counterId: "109386353",
    oauthToken: "secret-token",
    httpClient: {
      async get() {
        throw new Error("network unavailable");
      }
    }
  });

  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.visitsByClientId, {});
});
