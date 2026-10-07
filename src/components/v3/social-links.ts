import type { SocialContact } from "./SiteFooter";

type SocialEnvironment = Record<string, string | undefined>;

function safeWebUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function getConfiguredV3Socials(environment: SocialEnvironment = process.env): SocialContact[] {
  const candidates = [
    ["Instagram", environment.NEXT_PUBLIC_MIRACLE_INSTAGRAM_URL],
    ["Discord", environment.NEXT_PUBLIC_MIRACLE_DISCORD_URL],
    ["WhatsApp", environment.NEXT_PUBLIC_MIRACLE_WHATSAPP_URL],
  ] as const;

  return candidates.flatMap(([label, value]) => {
    const href = safeWebUrl(value);
    return href ? [{ label, href }] : [];
  });
}