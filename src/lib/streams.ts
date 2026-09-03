/** Only full TikTok LIVE links provide an account name without a network lookup. */
export function getTikTokLiveHandle(streamUrl: string): string | null {
  try {
    const url = new URL(streamUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !["tiktok.com", "www.tiktok.com"].includes(url.hostname) ||
      url.username || url.password || url.port
    ) return null;

    const match = url.pathname.match(/^\/@([A-Za-z0-9._]+)\/live\/?$/);
    return match ? `@${match[1]}` : null;
  } catch {
    return null;
  }
}
