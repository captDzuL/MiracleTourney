import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { routing } from "./routing";

export function getLocalizedRedirectPath(path: string, locale: "id" | "en") {
  const [rawPathname, search = ""] = path.split("?");
  const localePattern = new RegExp(`^/(?:${routing.locales.join("|")})(?=/|$)`);
  const pathname = rawPathname.replace(localePattern, "") || "/";
  const query = search ? `?${search}` : "";
  return pathname === "/" ? `/${locale}${query}` : `/${locale}${pathname}${query}`;
}

export async function redirectToActiveLocale(path: string): Promise<never> {
  let locale = routing.defaultLocale;

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    locale = routing.locales.includes(cookieLocale as "id" | "en")
      ? (cookieLocale as "id" | "en")
      : routing.defaultLocale;
  } catch {
    redirect(path as never);
  }

  redirect(getLocalizedRedirectPath(path, locale) as never);
}
