import { distanceKmBetween, isValidCoordinate } from "./domain.js";

export function restaurantsByDistance(restaurants, center) {
  if (!center || !isValidCoordinate(center)) return restaurants;
  return restaurants
    .map((restaurant, index) => ({
      restaurant,
      index,
      distance: isValidCoordinate(restaurant)
        ? distanceKmBetween(center, restaurant)
        : Infinity,
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ restaurant }) => restaurant);
}
