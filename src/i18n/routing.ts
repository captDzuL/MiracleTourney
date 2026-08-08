import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  // No URL prefix changes — locale is stored in cookie NEXT_LOCALE
  localePrefix: "always",
});
