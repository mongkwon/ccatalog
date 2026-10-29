import test from "node:test";
import assert from "node:assert/strict";
import { mapRecords, placeKey } from "../outputs/ccatalog/src/lib/groups.js";

const first = {
  id: "one",
  name: "같은 식당",
  lat: 37.5666,
  lng: 126.978,
  rating: 3,
  group: { color: "#5285bc" },
};
const second = { ...first, id: "two", rating: 1, group: { color: "#b87981" } };
test("one pin retains both group colors and selected group medal", () => {
  const pins = mapRecords([first, second], "two");
  assert.equal(pins.length, 1);
  assert.equal(pins[0].id, "two");
  assert.equal(pins[0].rating, 1);
  assert.deepEqual(pins[0].pinColors, ["#5285bc", "#b87981"]);
});
test("nearby branches and differently named places remain separate", () => {
  assert.notEqual(placeKey(first), placeKey({ ...first, lat: 37.567 }));
  assert.equal(mapRecords([first, { ...first, name: "다른 식당" }]).length, 2);
});
