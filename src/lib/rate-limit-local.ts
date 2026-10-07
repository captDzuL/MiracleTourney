/**
 * A bounded, process-local early-deny tracker.
 *
 * This tracker is intentionally not an allow authority: callers use the
 * shared database limiter for every authoritative decision. Entries are kept
 * only to deny a key that this process has recently observed as over quota or
 * failed closed, and to provide a conservative edge/middleware early deny.
 */
export const LOCAL_RATE_LIMIT_MAX_ENTRIES = 2_048;

type LocalRateLimitEntry = {
  count: number;
  resetAt: number;
  denied: boolean;
};

const entries = new Map<string, LocalRateLimitEntry>();

function prune(now: number) {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }

  while (entries.size > LOCAL_RATE_LIMIT_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (typeof oldest !== "string") break;
    entries.delete(oldest);
  }
}

/**
 * Returns false only for a local early-deny condition. A true result is not a
 * grant and must be followed by the shared database check.
 */
export function checkLocalRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  prune(now);
  const entry = entries.get(key);
  if (!entry || entry.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs, denied: false });
    prune(now);
    return true;
  }

  if (entry.denied || entry.count >= limit) {
    entry.denied = true;
    return false;
  }

  entry.count += 1;
  return true;
}

/** Records a shared-limiter denial or failure as a bounded local deny. */
export function markLocalRateLimitDenied(
  key: string,
  windowMs: number,
  now: number = Date.now(),
) {
  prune(now);
  const entry = entries.get(key);
  if (entry && entry.resetAt > now) {
    entry.denied = true;
    return;
  }

  entries.set(key, { count: 0, resetAt: now + windowMs, denied: true });
  prune(now);
}

/** Test-only reset hook; production callers never need to clear the tracker. */
export function resetLocalRateLimitForTests() {
  entries.clear();
}

/** Test-only bounded-size observation. */
export function getLocalRateLimitSizeForTests() {
  return entries.size;
}
