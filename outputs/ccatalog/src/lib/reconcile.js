export function reuseValue(previous, next) {
  return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

export function reconcileById(previous, next) {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const merged = next.map((item) => reuseValue(byId.get(item.id), item));
  return merged.length === previous.length &&
    merged.every((item, index) => item === previous[index])
    ? previous
    : merged;
}
