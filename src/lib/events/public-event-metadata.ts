import { getPublicEventBySlug } from "@/lib/platform/repository";

/**
 * Reads an event for `generateMetadata`. Metadata is a nicety, so a failed read gives no metadata instead of an error.
 * An error thrown from `generateMetadata` skips the segment's error boundary and ends on the global error page. The
 * page body reads the same event again and reports the failure inside the layout, where `error.tsx` can catch it.
 */
export async function readEventForMetadata(slug: string) {
  try {
    return await getPublicEventBySlug(slug);
  } catch {
    return null;
  }
}
