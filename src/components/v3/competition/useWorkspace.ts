"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutateCompetitionWorkspaceAction } from "@/lib/actions/competition-v3-actions";
import type { OperationCommand } from "@/lib/tournament/operations";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";

export function useWorkspace(initialState: CompetitionWorkspaceState) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [state, setState] = useState(initialState);
  const current = useRef(initialState);
  const [connectionError, setConnectionError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const mutating = useRef(false);
  const retryRequest = useRef<Parameters<typeof mutateCompetitionWorkspaceAction>[0] | null>(null);
  const router = useRouter();
  const accept = useCallback((next: CompetitionWorkspaceState) => {
    if (next.event.id === current.current.event.id && next.event.version < current.current.event.version) return;
    current.current = next; setState(next);
  }, []);
  useEffect(() => accept(initialState), [initialState, accept]);
  const polling = useRef<{ refresh: () => Promise<void> } | null>(null);
  useEffect(() => {
    let stopped = false, failures = 0, timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.visibilityState === "hidden") return;
      const fast = current.current.matches.some(m => ["live", "delayed", "postponed"].includes(m.scheduleStatus));
      timer = setTimeout(refresh, Math.min((fast ? 5000 : 15000) * 2 ** failures, 120000));
    };
    const refresh = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      clearTimeout(timer); active?.abort();
      const request = new AbortController(); active = request;
      try {
        const response = await fetch(`/api/organizer/events/${encodeURIComponent(initialState.event.id)}/competition`, { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("Read failed");
        const next = await response.json() as CompetitionWorkspaceState;
        if (!stopped && !request.signal.aborted) { accept(next); failures = 0; setConnectionError(false); }
      } catch {
        if (!stopped && !request.signal.aborted) { failures++; setConnectionError(true); }
      } finally { if (!stopped && !request.signal.aborted) schedule(); }
    };
    polling.current = { refresh };
    const visibility = () => { if (document.visibilityState === "hidden") { clearTimeout(timer); active?.abort(); } else void refresh(); };
    const focus = () => { void refresh(); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("focus", focus); schedule();
    return () => { stopped = true; clearTimeout(timer); active?.abort(); polling.current = null; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", focus); };
  }, [initialState.event.id, accept]);
  const refresh = () => polling.current?.refresh();
  async function execute(request: Parameters<typeof mutateCompetitionWorkspaceAction>[0]) {
    if (mutating.current) return;
    const eventId = current.current.event.id;
    mutating.current = true; setBusy(true); setActionError(null); setSaved(false);
    retryRequest.current = request;
    try {
      const result = await mutateCompetitionWorkspaceAction(request);
      if (current.current.event.id !== eventId) return;
      if (result.status !== "saved") throw new Error(result.status);
      const receipt = result.receipt;
      accept({ ...current.current, event: { ...current.current.event, version: receipt.version } });
      retryRequest.current = null; setSaved(true); router.refresh(); await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operation failed";
      if (/conflict|stale/i.test(message)) { retryRequest.current = null; setActionError("conflict"); await refresh(); }
      else if (/authorized|password|unavailable/i.test(message)) { retryRequest.current = null; setActionError("unauthorized"); }
      else { setActionError(message); }
    } finally { mutating.current = false; setBusy(false); }
  }
  const run = (command: OperationCommand) => execute({ eventId: current.current.event.id, expectedVersion: current.current.event.version, idempotencyKey: crypto.randomUUID(), command });
  return { state, busy: busy || !hydrated, saved, connectionError, actionError, refresh, run, canRetry: !!retryRequest.current, retry: () => retryRequest.current && execute(retryRequest.current) };
}
