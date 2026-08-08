import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { routing } from "./routing";

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

  const [pathname, search = ""] = path.split("?");
  const query = search ? `?${search}` : "";
  const target = pathname === "/" ? `/${locale}${query}` : `/${locale}${pathname}${query}`;

  redirect(target as never);
}
