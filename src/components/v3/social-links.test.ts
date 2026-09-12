import { describe, expect, it } from "vitest";

import { getConfiguredV3Socials } from "./social-links";

describe("getConfiguredV3Socials", () => {
  it("returns only configured valid web URLs", () => {
    expect(getConfiguredV3Socials({
      NEXT_PUBLIC_MIRACLE_INSTAGRAM_URL: "https://instagram.com/miracle",
      NEXT_PUBLIC_MIRACLE_DISCORD_URL: "javascript:alert(1)",
      NEXT_PUBLIC_MIRACLE_WHATSAPP_URL: "https://wa.me/628123",
    })).toEqual([
      { label: "Instagram", href: "https://instagram.com/miracle" },
      { label: "WhatsApp", href: "https://wa.me/628123" },
    ]);
  });

  it("does not invent social links when none are configured", () => {
    expect(getConfiguredV3Socials({})).toEqual([]);
  });
});