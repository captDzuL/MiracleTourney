import type { PublicOngoingEventViewModel } from "./public-ongoing-types";

/** One lifecycle-owned poller. A newer focus refresh always supersedes older work. */
export function startPublicOngoingPolling(options: {
  slug: string; initial: PublicOngoingEventViewModel;
  onData: (state: PublicOngoingEventViewModel) => void; onError: (failed: boolean) => void;
  onUnavailable?: () => void;
}) {
  let current = options.initial;
  let failures = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const visible = () => document.visibilityState !== "hidden";
  const interval = () => current.liveMatches.length || current.nextMatches.some(m => m.status === "delayed") ? 10000 : 30000;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && visible()) timer = setTimeout(refresh, Math.min(240000, interval() * 2 ** failures));
  };
  const refresh = async () => {
    clearTimeout(timer); controller?.abort();
    if (stopped || !visible()) return;
    const request = new AbortController(); controller = request;
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(options.slug)}/ongoing`, { signal: request.signal, cache: "no-store", headers: { "If-None-Match": `"${current.stateVersion}"` } });
      if (request.signal.aborted || stopped) return;
      if (response.status === 404 && options.onUnavailable) { stopped = true; options.onUnavailable(); return; }
      if (response.status !== 304 && !response.ok) throw new Error("Refresh unavailable");
      const updated = response.status === 304 ? null : await response.json() as PublicOngoingEventViewModel;
      if (request.signal.aborted || stopped) return;
      if (updated) { current = updated; options.onData(current); }
      failures = 0; options.onError(false);
    } catch {
      if (request.signal.aborted || stopped) return;
      failures = Math.min(5, failures + 1); options.onError(true);
    } finally { if (!request.signal.aborted && !stopped) schedule(); }
  };
  const visibility = () => { if (visible()) void refresh(); else { clearTimeout(timer); controller?.abort(); } };
  const focus = () => { void refresh(); };
  document.addEventListener("visibilitychange", visibility); window.addEventListener("focus", focus);
  schedule();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", focus); };
}
