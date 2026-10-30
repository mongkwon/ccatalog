import Supercluster from "supercluster";
import { distanceKmBetween, isValidCoordinate } from "./domain.js";

export const CLUSTER_MAX_ZOOM = 21;

const MEDAL_TINTS = {
  1: "rgba(184, 130, 88, 0.46)",
  2: "rgba(163, 176, 190, 0.48)",
  3: "rgba(214, 174, 77, 0.48)",
};

export function clusterFill(members) {
  const colors = [...new Set(members.map((member) => Number(member.rating)))]
    .sort((a, b) => a - b)
    .map((rating) => MEDAL_TINTS[rating])
    .filter(Boolean);
  return colors.length > 1
    ? `linear-gradient(135deg, ${colors.join(", ")})`
    : colors[0] || "rgba(245, 247, 250, 0.28)";
}

export class RestaurantClusters {
  constructor() {
    this.signature = "";
    this.index = null;
    this.records = new Map();
  }

  update(restaurants) {
    const points = restaurants
      .filter(isValidCoordinate)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    this.records = new Map(points.map((point) => [point.id, point]));
    const signature = JSON.stringify(
      points.map(({ id, lat, lng }) => [id, lat, lng]),
    );
    if (signature === this.signature) return;
    this.signature = signature;
    // Naver's Web Mercator map uses 256px tiles; radius is measured in CSS pixels.
    this.index = new Supercluster({
      radius: 52,
      extent: 256,
      maxZoom: CLUSTER_MAX_ZOOM,
    }).load(
      points.map((point) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lng, point.lat] },
        properties: { id: point.id },
      })),
    );
  }

  nodes(zoom) {
    if (!this.index) return [];
    return this.index
      .getClusters(
        [-180, -85, 180, 85],
        Math.max(0, Math.min(CLUSTER_MAX_ZOOM, Math.floor(zoom))),
      )
      .map((feature) => {
        if (!feature.properties.cluster) {
          const restaurant = this.records.get(feature.properties.id);
          return {
            key: restaurant.id,
            restaurant,
            lat: restaurant.lat,
            lng: restaurant.lng,
            members: [restaurant],
          };
        }
        const { cluster_id: id } = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;
        const members = this.index
          .getLeaves(id, Infinity)
          .map((point) => this.records.get(point.properties.id));
        const restaurant = members.reduce((closest, candidate) =>
          distanceKmBetween({ lat, lng }, candidate) <
          distanceKmBetween({ lat, lng }, closest)
            ? candidate
            : closest,
        );
        return {
          key: `cluster:${id}`,
          cluster: true,
          restaurant,
          lat,
          lng,
          members,
          expansionZoom: this.index.getClusterExpansionZoom(id),
        };
      });
  }
}
