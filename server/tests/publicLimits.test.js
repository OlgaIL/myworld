import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { getPublicLimits } from "../services/publicLimitsService.js";
import { createApp } from "../app.js";

test("registration allowance follows the database default, including a later return to ten", async () => {
  let storedDefault = "5";
  const queryImplementation = async command => {
    assert.match(command.text, /information_schema\.columns/u);
    assert.match(command.text, /free_processing_limit/u);
    assert.doesNotMatch(command.text, /update|insert|records_processed_total/iu);
    return { rows: [{ column_default: storedDefault }] };
  };
  assert.deepEqual(await getPublicLimits({ queryImplementation, guestLimit: 3 }), { guestDocumentLimit: 3, freeProcessingLimit: 5 });
  storedDefault = "10";
  assert.deepEqual(await getPublicLimits({ queryImplementation, guestLimit: 7 }), { guestDocumentLimit: 7, freeProcessingLimit: 10 });
});

test("unavailable or unexpected default is not replaced with an invented public allowance", async () => {
  for (const value of [null, "", "oops", "5 + 5", "-1", "Infinity"]) {
    const result = await getPublicLimits({ guestLimit: 3, queryImplementation: async () => ({ rows: [{ column_default: value }] }) });
    assert.equal(result.freeProcessingLimit, null);
    assert.equal(result.guestDocumentLimit, 3);
  }
  assert.equal((await getPublicLimits({ queryImplementation: async () => { throw Error("private database error"); } })).freeProcessingLimit, null);
});

test("anonymous public endpoint returns only current allowances and disables caching", async () => {
  const server = http.createServer(createApp({ loadPublicLimits: async () => ({ guestDocumentLimit: 3, freeProcessingLimit: 5 }) }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public-limits`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { guestDocumentLimit: 3, freeProcessingLimit: 5 });
    assert.equal(response.headers.get("set-cookie"), null);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
