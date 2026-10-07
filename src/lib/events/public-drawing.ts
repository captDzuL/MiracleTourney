import { getPublicDrawingEvent } from "./adaptive-public-phases";

/** Public drawing reader; it returns a view only after an official V3 phase is active. */
export async function readPublicDrawing(slug: string) {
  return getPublicDrawingEvent(slug);
}

export { getPublicDrawingEvent } from "./adaptive-public-phases";
