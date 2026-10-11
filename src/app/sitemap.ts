import type { MetadataRoute } from "next";

import { getAllPublicEvents } from "@/lib/platform/repository";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://miracle-league.fun";

// Built on every request. As a static file it was generated once at build time, so a build that could not reach the
// database kept a sitemap without events until the next deploy, and the build had to reach the database at all.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await getAllPublicEvents();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/id`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/en`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/id/events`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/en/events`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
  ];

  const eventRoutes: MetadataRoute.Sitemap = events.flatMap(({ slug, updatedAt }) => [
    { url: `${BASE_URL}/id/events/${slug}`, lastModified: updatedAt, changeFrequency: "hourly" as const, priority: 0.8 },
    { url: `${BASE_URL}/en/events/${slug}`, lastModified: updatedAt, changeFrequency: "hourly" as const, priority: 0.8 },
    { url: `${BASE_URL}/id/events/${slug}/bracket`, lastModified: updatedAt, changeFrequency: "hourly" as const, priority: 0.7 },
    { url: `${BASE_URL}/id/events/${slug}/participants`, lastModified: updatedAt, changeFrequency: "daily" as const, priority: 0.6 },
  ]);

  return [...staticRoutes, ...eventRoutes];
}
