import test from "node:test";
import assert from "node:assert/strict";
import { branchBrandName } from "../outputs/ccatalog/src/lib/branches.js";

test("branch search strips a separated branch suffix and preserves the brand", () => {
  for (const [name, brand] of [
    ["정돈 논현점", "정돈"],
    ["정돈 본점", "정돈"],
    ["백운동 판교점", "백운동"],
    ["홍콩반점0410 강남역점", "홍콩반점0410"],
    ["  브랜드 이름   성수점  ", "브랜드 이름"],
    ["정돈 (논현점)", "정돈"],
  ])
    assert.equal(branchBrandName(name), brand);
});

test("ordinary names and ambiguous unseparated suffixes do not enable branch search", () => {
  for (const name of [
    null,
    "",
    "정돈",
    "홍콩반점",
    "동네 상점",
    "중화 반점",
    "한국 음식점",
    "정돈논현점",
    "점",
  ])
    assert.equal(branchBrandName(name), null);
});
