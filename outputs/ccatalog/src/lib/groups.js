export function placeKey(restaurant) {
  return `${restaurant.name.replace(/\s/g, "").toLowerCase()}:${Number(restaurant.lat).toFixed(5)}:${Number(restaurant.lng).toFixed(5)}`;
}

export function mapRecords(restaurants, selectedId) {
  const places = new Map();
  for (const record of restaurants) {
    const key = placeKey(record);
    const existing = places.get(key);
    if (existing) existing.push(record);
    else places.set(key, [record]);
  }
  return [...places.values()].map((records) => {
    const selected = records.find((record) => record.id === selectedId);
    return {
      ...(selected || records[0]),
      pinColors: [
        ...new Set(
          records.map((record) => record.group?.color).filter(Boolean),
        ),
      ],
    };
  });
}
