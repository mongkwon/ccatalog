export async function shareInvite(url, groupName, browser = navigator) {
  const data = {
    title: `까탈로그 · ${groupName}`,
    text: `${groupName}에서 맛집을 함께 나눠요.`,
    url,
  };
  let shareFailed = false;
  if (
    typeof browser.share === "function" &&
    (!browser.canShare || browser.canShare(data))
  ) {
    try {
      await browser.share(data);
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
      shareFailed = true;
    }
  }
  try {
    await browser.clipboard.writeText(url);
    return shareFailed ? "retry-copied" : "copied";
  } catch {
    return shareFailed ? "retry" : "manual";
  }
}
