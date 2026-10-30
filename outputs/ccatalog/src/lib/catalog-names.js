export function latestNameRecord(previous, next) {
  return previous &&
    Date.parse(previous.updated_at) > Date.parse(next.updated_at)
    ? previous
    : next;
}

export function mergeMemberNames(previous, members) {
  const result = { ...previous };
  for (const member of members) {
    if (member?.id && member.nickname)
      result[member.id] = latestNameRecord(result[member.id], {
        nickname: member.nickname,
        updated_at: member.updated_at,
      });
  }
  return result;
}
