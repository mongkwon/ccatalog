const RETURN_ROUTE_KEY = "ccatalog.auth.returnRestaurant";
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const restaurantRoute = new RegExp(`^#/restaurants/(${UUID})/?$`, "i");

export function restaurantIdFromHash(hash) {
  return (
    String(hash ?? "")
      .match(restaurantRoute)?.[1]
      ?.toLowerCase() ?? null
  );
}

export function restaurantHash(id) {
  return id && restaurantIdFromHash(`#/restaurants/${id}`)
    ? `#/restaurants/${id.toLowerCase()}`
    : "#/";
}

export function rememberReturnRestaurant(hash, storage = sessionStorage) {
  try {
    const id = restaurantIdFromHash(hash);
    if (id)
      storage.setItem(RETURN_ROUTE_KEY, JSON.stringify({ id, at: Date.now() }));
    else storage.removeItem(RETURN_ROUTE_KEY);
  } catch {
    /* Login remains available without browser storage. */
  }
}

export function takeReturnRestaurant(storage = sessionStorage) {
  try {
    const raw = storage.getItem(RETURN_ROUTE_KEY);
    storage.removeItem(RETURN_ROUTE_KEY);
    const saved = JSON.parse(raw);
    return saved &&
      Number.isFinite(saved.at) &&
      Date.now() - saved.at >= 0 &&
      Date.now() - saved.at < 30 * 60 * 1000
      ? restaurantIdFromHash(`#/restaurants/${saved.id}`)
      : null;
  } catch {
    return null;
  }
}
