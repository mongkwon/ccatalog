export function branchBrandName(name) {
  const normalized = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const match = normalized.match(
    /^(.+?)\s+(?:\(([^()\s]+점)\)|([^()\s]+점))$/u,
  );
  if (!match) return null;
  const branch = match[2] || match[3];
  if (
    ["점", "반점", "상점", "음식점", "전문점", "대리점", "가맹점"].includes(
      branch,
    )
  )
    return null;
  return match[1];
}
