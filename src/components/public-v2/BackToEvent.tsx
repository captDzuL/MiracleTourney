import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export type BackToEventProps = {
  slug: string;
  locale?: "id" | "en";
  label: string;
};

export function BackToEvent({ slug, locale, label }: BackToEventProps) {
  const prefix = locale ? `/${locale}` : "";

  return (
    <Link href={`${prefix}/events/${slug}`} className="pv-back-link mb-4 inline-flex items-center gap-2 text-sm font-medium">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
