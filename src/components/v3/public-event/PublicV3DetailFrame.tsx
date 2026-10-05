import type { ReactNode } from "react";

import { PublicV3Action } from "@/components/v3/public-discovery/PublicV3Primitives";

export function PublicV3DetailFrame({ backLabel, children, description, event, locale, title }: {
  backLabel: string;
  children: ReactNode;
  description: string;
  event: { name: string; slug: string };
  locale?: "id" | "en";
  title: string;
}) {
  const eventHref = `${locale ? `/${locale}` : ""}/events/${event.slug}`;

  return (
    <div className="miracle-public-v3 mpv3-detail-page">
      <div className="mpv3-directory-breadcrumb">
        <PublicV3Action href={eventHref} variant="text">← {backLabel}</PublicV3Action>
      </div>
      <div className="mpv3-directory-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
