import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRestaurant,
  normalizeMenuItems,
  normalizeMenuPrice,
  distanceKmBetween,
  inferCategoryFromPlace,
  seedRestaurants,
} from "../outputs/ccatalog/src/lib/domain.js";

test("stored restaurants preserve menus, prices and supported delivery apps", () => {
  const restaurant = normalizeRestaurant({
    ...seedRestaurants[0],
    menu_items: [{ name: "냉면", price: 15000 }],
    deliveryApps: ["baemin", "baemin", "invalid"],
  });
  assert.deepEqual(restaurant.menuItems, [{ name: "냉면", price: "15,000원" }]);
  assert.deepEqual(restaurant.deliveryApps, ["baemin"]);
  assert.deepEqual(restaurant.menus, ["냉면"]);
});

test("menu normalization de-duplicates and limits to six", () => {
  const input = [
    { name: "국수", price: "7000" },
    { name: "국수", price: "8000" },
    ...Array.from({ length: 8 }, (_, i) => ({
      name: `메뉴${i}`,
      price: "1000",
    })),
  ];
  const menus = normalizeMenuItems(input);
  assert.equal(menus.length, 6);
  assert.deepEqual(menus[0], { name: "국수", price: "7,000원" });
  assert.equal(normalizeMenuPrice("15,000원"), "15,000원");
});

test("distance calculation distinguishes the visit radius boundary", () => {
  const origin = { lat: 37.566535, lng: 126.977969 };
  assert.equal(distanceKmBetween(origin, origin), 0);
  assert.ok(
    distanceKmBetween(origin, { ...origin, lat: origin.lat + 0.004 }) < 0.5,
  );
  assert.ok(
    distanceKmBetween(origin, { ...origin, lat: origin.lat + 0.005 }) > 0.5,
  );
});

test("restaurant validation preserves medal restrictions and legacy menu records", () => {
  assert.equal(normalizeRestaurant({ ...seedRestaurants[0], rating: 0 }), null);
  assert.equal(
    normalizeRestaurant({ ...seedRestaurants[0], lat: "invalid" }),
    null,
  );
  assert.deepEqual(normalizeRestaurant(seedRestaurants[0]).menuItems[0], {
    name: "물냉면",
    price: "",
  });
  assert.equal(inferCategoryFromPlace("음식점>일식>초밥"), "일식");
});
