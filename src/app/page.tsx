import { redirectToActiveLocale } from "@/i18n/redirect";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ game?: string }>;
}) {
  const resolved = await searchParams;
  const query = resolved?.game ? `?game=${encodeURIComponent(resolved.game)}` : "";

  await redirectToActiveLocale(`/${query}` === "/" ? "/" : `/${query}`);
}
