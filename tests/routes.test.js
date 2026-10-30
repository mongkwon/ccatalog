import test from "node:test";
import assert from "node:assert/strict";
import {
  restaurantIdFromHash,
  restaurantHash,
  rememberReturnRestaurant,
  takeReturnRestaurant,
} from "../outputs/ccatalog/src/lib/routes.js";

const id = "11111111-1111-4111-8111-111111111111";
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
test("only restaurant UUID routes are accepted and OAuth fragments are ignored", () => {
  assert.equal(restaurantIdFromHash(restaurantHash(id)), id);
  assert.equal(restaurantIdFromHash(`#/restaurants/${id}/`), id);
  for (const hash of [
    "",
    "#/",
    "#/restaurants/bad",
    "#access_token=secret",
    "#/restaurants/https://evil.test",
    `#/restaurants/${id}?redirect=evil`,
  ])
    assert.equal(restaurantIdFromHash(hash), null);
  assert.equal(restaurantHash("https://evil.test"), "#/");
});
test("login return route is local, consumed once and expires", () => {
  const store = storage();
  rememberReturnRestaurant(restaurantHash(id), store);
  assert.equal(takeReturnRestaurant(store), id);
  assert.equal(takeReturnRestaurant(store), null);
  store.setItem(
    "ccatalog.auth.returnRestaurant",
    JSON.stringify({ id, at: Date.now() - 31 * 60000 }),
  );
  assert.equal(takeReturnRestaurant(store), null);
  store.setItem("ccatalog.auth.returnRestaurant", "invalid JSON");
  assert.equal(takeReturnRestaurant(store), null);
  rememberReturnRestaurant(restaurantHash(id), store);
  rememberReturnRestaurant("#/", store);
  assert.equal(takeReturnRestaurant(store), null);
});
