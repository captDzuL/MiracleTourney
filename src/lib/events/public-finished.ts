import { getPublicFinishedEvent } from "./adaptive-public-phases";

/** Public completion reader; certificate links are filtered by the authoritative reader. */
export async function readPublicFinished(slug: string) {
  return getPublicFinishedEvent(slug);
}

export { getPublicFinishedEvent } from "./adaptive-public-phases";
