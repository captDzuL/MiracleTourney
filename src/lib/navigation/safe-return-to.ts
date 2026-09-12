const EVENT_REGISTRATION_PATH = /^\/(?:(?:id|en)\/)?events\/[a-z0-9-]+\/register(?:\?[^#]*)?$/;

export function getSafeReturnTo(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.includes("\\") || path.includes("..")) return null;
  return EVENT_REGISTRATION_PATH.test(path) ? path : null;
}
