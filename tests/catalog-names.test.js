import test from "node:test";
import assert from "node:assert/strict";
import {
  latestNameRecord,
  mergeMemberNames,
} from "../outputs/ccatalog/src/lib/catalog-names.js";

test("late name snapshots cannot overwrite a newer saved name", () => {
  const newest = { nickname: "새 이름", updated_at: "2026-10-30T00:00:10Z" };
  const old = {
    id: "a",
    nickname: "이전 이름",
    updated_at: "2026-10-30T00:00:00Z",
  };
  assert.equal(latestNameRecord(newest, old), newest);
  assert.equal(mergeMemberNames({ a: newest }, [old]).a, newest);
  assert.equal(
    mergeMemberNames({}, [{ id: "a", ...newest }, old]).a.nickname,
    "새 이름",
  );
});
