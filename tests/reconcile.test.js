import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileById,
  reuseValue,
} from "../outputs/ccatalog/src/lib/reconcile.js";

test("unchanged refresh preserves records and nested values", () => {
  const previous = [
    { id: "a", photos: [{ url: "one" }] },
    { id: "b", name: "B" },
  ];
  assert.equal(reconcileById(previous, structuredClone(previous)), previous);
  assert.equal(
    reuseValue(previous[0], structuredClone(previous[0])),
    previous[0],
  );
  const changed = reconcileById(previous, [
    { id: "a", photos: [{ url: "two" }] },
    { ...previous[1] },
  ]);
  assert.notEqual(changed[0], previous[0]);
  assert.equal(changed[1], previous[1]);
});

test("membership removal, ordering and insertion remain observable", () => {
  const previous = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(reconcileById(previous, [{ id: "b" }]), [previous[1]]);
  const reordered = reconcileById(previous, [{ id: "b" }, { id: "a" }]);
  assert.equal(reordered[0], previous[1]);
  assert.equal(reordered[1], previous[0]);
  assert.deepEqual(reconcileById(previous, [{ id: "c" }]), [{ id: "c" }]);
});
