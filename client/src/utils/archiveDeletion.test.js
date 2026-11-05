import assert from "node:assert/strict";
import test from "node:test";
import { getDeletionOutcome, recordCountLabel } from "./archiveDeletion.js";

test("confirmation names exactly the selected number of records", () => {
  assert.equal(recordCountLabel(1),"1 запись");assert.equal(recordCountLabel(2),"2 записи");
  assert.equal(recordCountLabel(12),"12 записей");assert.equal(recordCountLabel(21),"21 запись");
  assert.equal(recordCountLabel(59),"59 записей");
});
test("partial results never count unrequested or unconfirmed deletions as successful", () => {
  const snapshot=["one","two","three"];
  assert.deepEqual(getDeletionOutcome(snapshot,{deleted:["one","one","new-upload"]}),{deleted:["one"],missing:[],failed:["two","three"]});
  assert.deepEqual(snapshot,["one","two","three"]);
  assert.deepEqual(getDeletionOutcome(snapshot,null),{deleted:[],missing:[],failed:snapshot});
  assert.deepEqual(getDeletionOutcome(snapshot,{deleted:["one"],missing:["two","new-upload"]}),
    {deleted:["one"],missing:["two"],failed:["three"]});
});
