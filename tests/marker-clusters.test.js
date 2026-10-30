import test from "node:test";
import assert from "node:assert/strict";
import {
  clusterFill,
  RestaurantClusters,
} from "../outputs/ccatalog/src/lib/marker-clusters.js";
import { mapRecords } from "../outputs/ccatalog/src/lib/groups.js";

const points = [
  { id: "a", name: "첫 식당", lat: 37.5, lng: 127, rating: 3 },
  { id: "b", name: "가운데 식당", lat: 37.5001, lng: 127.0001, rating: 1 },
  { id: "c", name: "끝 식당", lat: 37.5002, lng: 127.0002, rating: 2 },
];
test("cluster fill uses only present medal colors and a solid tint for one grade", () => {
  const fill = clusterFill([{ rating: 3 }, { rating: 2 }, { rating: 3 }]);
  assert(fill.startsWith("linear-gradient(135deg,"));
  assert(fill.includes("rgba(214, 174, 77, 0.48)"));
  assert(fill.includes("rgba(163, 176, 190, 0.48)"));
  assert(!fill.includes("rgba(184, 130, 88, 0.46)"));
  assert.equal(
    clusterFill([{ rating: 1 }, { rating: 1 }]),
    "rgba(184, 130, 88, 0.46)",
  );
});
test("nearby pins cluster at low zoom and choose the central restaurant, independent of medals", () => {
  const model = new RestaurantClusters();
  model.update(points);
  const nodes = model.nodes(13);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].members.length, 3);
  assert.equal(nodes[0].restaurant.id, "b");
  assert.equal(nodes[0].restaurant.rating, 1);
  assert(nodes[0].expansionZoom > 13);
  assert.equal(model.nodes(21).length, 3);
});
test("metadata changes reuse the spatial index, while filters and coordinates rebuild it", () => {
  const model = new RestaurantClusters();
  model.update(points);
  const index = model.index;
  model.update(points.map((point) => ({ ...point, rating: 2 })));
  assert.equal(model.index, index);
  assert.equal(model.nodes(13)[0].restaurant.rating, 2);
  model.update([points[0]]);
  assert.equal(model.nodes(13)[0].cluster, undefined);
  model.update([]);
  assert.equal(model.nodes(13).length, 0);
});
test("same-place group records count once and coincident distinct restaurants remain selectable at max zoom", () => {
  const model = new RestaurantClusters();
  const shared = { ...points[0], id: "another-group", rating: 1 };
  model.update(mapRecords([points[0], shared, points[1]], null));
  assert.equal(model.nodes(13)[0].members.length, 2);
  model.update([
    points[0],
    { ...points[0], id: "same-building", name: "다른 층 식당" },
  ]);
  assert.equal(model.nodes(21)[0].members.length, 2);
  assert(model.nodes(21)[0].expansionZoom > 21);
});
