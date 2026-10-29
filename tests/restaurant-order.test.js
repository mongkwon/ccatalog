import test from "node:test";
import assert from "node:assert/strict";
import { restaurantsByDistance } from "../outputs/ccatalog/src/lib/restaurant-order.js";

test("map center determines distance order while retaining offscreen restaurants", () => {
  const restaurants = [
    { id: "south", lat: 35, lng: 127 },
    { id: "north", lat: 38, lng: 127 },
    { id: "middle", lat: 37, lng: 127 },
  ];
  assert.deepEqual(
    restaurantsByDistance(restaurants, { lat: 37.9, lng: 127 }).map(
      (r) => r.id,
    ),
    ["north", "middle", "south"],
  );
  assert.deepEqual(
    restaurantsByDistance(restaurants, { lat: 35.1, lng: 127 }).map(
      (r) => r.id,
    ),
    ["south", "middle", "north"],
  );
  assert.equal(restaurants[0].id, "south");
  assert.equal(restaurantsByDistance(restaurants, null), restaurants);
});

test("equal distances retain stable order and invalid coordinates go last", () => {
  const restaurants = [
    { id: "bad", lat: NaN, lng: 127 },
    { id: "a", lat: 37, lng: 127 },
    { id: "b", lat: 37, lng: 127 },
  ];
  assert.deepEqual(
    restaurantsByDistance(restaurants, { lat: 37, lng: 127 }).map((r) => r.id),
    ["a", "b", "bad"],
  );
});
