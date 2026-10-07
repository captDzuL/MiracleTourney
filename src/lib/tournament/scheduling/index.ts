import type { CompetitionGraph, ParticipantSource } from "../competition";

export type ScheduleAssignment = { matchId: string; roomId: string; start: string; end: string };
export type ScheduleInput = {
  graph: CompetitionGraph;
  timezone: string;
  eventWindow: { start: string; end: string };
  matchDurationMinutes: number;
  bufferMinutes: number;
  minimumRestMinutes: number;
  /** Soft rest target; minimumRestMinutes remains the hard requirement. */
  preferredRestMinutes?: number;
  rooms: readonly string[];
  existingAssignments?: readonly ScheduleAssignment[];
  manualOverrides?: readonly ScheduleAssignment[];
  lockedMatchIds?: readonly string[];
  matchStates?: Readonly<Record<string, "scheduled" | "live" | "completed">>;
};
export type ScheduleConflict = { code: string; matchIds: string[]; message: string };
export type ScheduleDraft = {
  kind: "draft";
  timezone: string;
  assignments: ScheduleAssignment[];
  conflicts: ScheduleConflict[];
  warnings: ScheduleConflict[];
  feasible: boolean;
  affectedMatchIds: string[];
  recalculatedMatchIds: string[];
  impact: { matchId: string; before: ScheduleAssignment | null; after: ScheduleAssignment | null; delayMinutes: number | null }[];
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const iso = (time: number) => new Date(time).toISOString();
const sameAssignment = (a: ScheduleAssignment | undefined, b: ScheduleAssignment | undefined) =>
  a?.roomId === b?.roomId && a?.start === b?.start && a?.end === b?.end;
const normalize = (a: ScheduleAssignment): ScheduleAssignment => ({ ...a, start: iso(Date.parse(a.start)), end: iso(Date.parse(a.end)) });
const immutable = (input: ScheduleInput, id: string) => input.lockedMatchIds?.includes(id) || ["live", "completed"].includes(input.matchStates?.[id] ?? "");

function graphConstraints(graph: CompetitionGraph) {
  const dependencies = new Map(graph.matches.map(m => [m.id, new Set<string>()]));
  const addSource = (id: string, source: ParticipantSource) => {
    if (source.kind === "match") dependencies.get(id)!.add(source.matchId);
    if (source.kind === "group_rank") {
      const games = graph.matches.filter(m => m.groupId === source.groupId && m.status === "pending");
      if (!graph.groups.some(g => g.id === source.groupId) || !games.length) dependencies.get(id)!.add(`missing-group:${source.groupId}`);
      games.forEach(m => dependencies.get(id)!.add(m.id));
    }
  };
  graph.matches.forEach(m => { addSource(m.id, m.home); addSource(m.id, m.away); });
  graph.dependencies.forEach(d => dependencies.get(d.targetMatchId)?.add(d.sourceMatchId));
  graph.qualificationDependencies.forEach(d => {
    if (dependencies.has(d.targetMatchId)) addSource(d.targetMatchId, { kind: "group_rank", groupId: d.groupId, rank: d.rank });
  });
  const possible = (source: ParticipantSource, seen: Set<string>): string[] => {
    if (source.kind === "team") return [source.teamId];
    if (source.kind === "group_rank") return graph.groups.find(g => g.id === source.groupId)?.teams.map(t => t.id) ?? [];
    if (source.kind !== "match" || seen.has(source.matchId)) return [];
    const match = graph.matches.find(m => m.id === source.matchId);
    if (!match) return [];
    const visited = new Set([...seen, match.id]);
    return [...possible(match.home, visited), ...possible(match.away, visited)];
  };
  const participants = new Map(graph.matches.map(m => [m.id, new Set([...possible(m.home, new Set()), ...possible(m.away, new Set())])]));
  const shared = (a: string, b: string) => [...participants.get(a) ?? []].some(t => participants.get(b)?.has(t));
  // Detect cycles from graph structure: a reserved override must not satisfy
  // its own prerequisite, directly or through an already assigned cycle.
  const visiting = new Set<string>();
  const cycleMemo = new Map<string, boolean>();
  const reliesOnCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (cycleMemo.has(id)) return cycleMemo.get(id)!;
    visiting.add(id);
    const cyclic = [...dependencies.get(id) ?? []].some(reliesOnCycle);
    visiting.delete(id);
    cycleMemo.set(id, cyclic);
    return cyclic;
  };
  const cycleAffected = new Set(graph.matches.filter(m => reliesOnCycle(m.id)).map(m => m.id));
  return { dependencies, shared, cycleAffected };
}

function invalidInput(input: ScheduleInput): string | null {
  try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); } catch { return "Use a valid IANA timezone."; }
  const instant = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const local = value.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "Z");
    return new Date(local).toISOString().slice(0, 19) === value.slice(0, 19);
  };
  if (!instant(input.eventWindow.start) || !instant(input.eventWindow.end) || Date.parse(input.eventWindow.start) >= Date.parse(input.eventWindow.end)) return "Use an ordered event window with explicit UTC offsets.";
  if (![input.matchDurationMinutes, input.bufferMinutes, input.minimumRestMinutes, input.preferredRestMinutes ?? input.minimumRestMinutes].every(n => Number.isFinite(n) && Number.isSafeInteger(n * 60000) && n >= 0) || input.matchDurationMinutes <= 0 || (input.preferredRestMinutes ?? input.minimumRestMinutes) < input.minimumRestMinutes) return "Duration must be positive; buffer and rest must be nonnegative finite minutes, with preferred rest at least minimum rest.";
  if (!input.rooms.length || input.rooms.some(id => !id.trim()) || new Set(input.rooms).size !== input.rooms.length) return "Provide unique nonempty room IDs.";
  const ids = new Set(input.graph.matches.map(m => m.id));
  const playable = new Set(input.graph.matches.filter(m => m.status === "pending").map(m => m.id));
  if (ids.size !== input.graph.matches.length || input.graph.matches.some(m => !m.id.trim())) return "Match IDs must be unique and nonempty.";
  for (const assignments of [input.existingAssignments ?? [], input.manualOverrides ?? []]) {
    if (new Set(assignments.map(a => a.matchId)).size !== assignments.length || assignments.some(a => !playable.has(a.matchId) || !a.roomId.trim() || !instant(a.start) || !instant(a.end) || Date.parse(a.start) >= Date.parse(a.end))) return "Assignments require unique playable match IDs, room IDs, and ordered instants.";
  }
  if ([...input.lockedMatchIds ?? [], ...Object.keys(input.matchStates ?? {})].some(id => !playable.has(id))) return "Locks and match states must refer to playable matches.";
  return null;
}

export function planSchedule(input: ScheduleInput): ScheduleDraft {
  return schedule(input);
}

export function recalculateSchedule(input: ScheduleInput & { changedMatchIds: readonly string[] }): ScheduleDraft {
  const { dependencies } = graphConstraints(input.graph);
  const playable = new Set(input.graph.matches.filter(m => m.status === "pending").map(m => m.id));
  if (input.changedMatchIds.some(id => !playable.has(id))) return schedule(input, new Set(input.changedMatchIds));
  const scope = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, root = false) => {
    // A barrier is not a completed traversal: an overlapping changed root must
    // still be allowed to walk its own descendants later.
    if (immutable(input, id) && !root) return;
    if (visited.has(id)) return;
    visited.add(id);
    if (playable.has(id) && !immutable(input, id)) scope.add(id);
    for (const [target, sources] of dependencies) if (sources.has(id)) visit(target);
  };
  [...input.changedMatchIds].sort(compare).forEach(id => visit(id, true));
  return schedule(input, scope);
}

function schedule(input: ScheduleInput, scope?: Set<string>): ScheduleDraft {
  const draft: ScheduleDraft = { kind: "draft", timezone: input.timezone, assignments: [], conflicts: [], warnings: [], feasible: true, affectedMatchIds: [], recalculatedMatchIds: [], impact: [] };
  const invalid = invalidInput(input) ?? (scope && [...scope].some(id => !input.graph.matches.some(m => m.id === id && m.status === "pending")) ? "Changed matches must be playable graph matches." : null);
  if (invalid) {
    draft.feasible = false;
    draft.conflicts.push({ code: "INVALID_INPUT", matchIds: [], message: invalid });
    return draft;
  }
  const { dependencies, shared, cycleAffected } = graphConstraints(input.graph);
  const rest = input.minimumRestMinutes * 60000;
  const preferredRest = (input.preferredRestMinutes ?? input.minimumRestMinutes) * 60000;
  const buffer = input.bufferMinutes * 60000;
  const duration = input.matchDurationMinutes * 60000;
  const existing = new Map((input.existingAssignments ?? []).map(a => [a.matchId, normalize(a)]));
  const overrides = new Map((input.manualOverrides ?? []).map(a => [a.matchId, normalize(a)]));
  const games = input.graph.matches.filter(m => m.status === "pending").sort((a, b) => compare(a.id, b.id));
  draft.recalculatedMatchIds = games.filter(m => (!scope || scope.has(m.id)) && !immutable(input, m.id)).map(m => m.id);
  const fixed = new Set<string>();
  const protectedMatch = (id: string) => immutable(input, id) || Boolean(scope && !scope.has(id));
  const conflict = (code: string, matchIds: string[], message: string) => {
    const sorted = [...matchIds].sort(compare);
    if (!draft.conflicts.some(c => c.code === code && c.matchIds.join("\u0000") === sorted.join("\u0000"))) draft.conflicts.push({ code, matchIds: sorted, message });
  };
  for (const match of games) {
    const old = existing.get(match.id);
    const override = overrides.get(match.id);
    if (cycleAffected.has(match.id)) {
      conflict("UNRESOLVED_DEPENDENCY", [match.id], "The match relies on a cyclic prerequisite.");
      if (!protectedMatch(match.id)) { fixed.add(match.id); continue; }
    }
    if (protectedMatch(match.id)) {
      fixed.add(match.id);
      if (old) draft.assignments.push({ ...old });
      else if (immutable(input, match.id)) conflict("MISSING_IMMUTABLE_ASSIGNMENT", [match.id], "A locked, live, or completed match requires its existing assignment.");
      if (override && !sameAssignment(old, override)) conflict(immutable(input, match.id) ? "IMMUTABLE_OVERRIDE" : "OVERRIDE_OUTSIDE_SCOPE", [match.id], "The requested override would move a protected match.");
    } else if (override) {
      fixed.add(match.id);
      draft.assignments.push({ ...override });
    }
  }
  const pending = games.filter(m => !fixed.has(m.id));
  const overlaps = (a: ScheduleAssignment, b: ScheduleAssignment, gap: number) => Date.parse(a.start) < Date.parse(b.end) + gap && Date.parse(a.end) + gap > Date.parse(b.start);
  const pairCodes = (a: ScheduleAssignment, b: ScheduleAssignment) => {
    const codes: string[] = [];
    if (a.roomId === b.roomId && overlaps(a, b, buffer)) codes.push("ROOM_OVERLAP");
    if (shared(a.matchId, b.matchId) && overlaps(a, b, rest)) codes.push("TEAM_REST");
    if (dependencies.get(a.matchId)?.has(b.matchId) && Date.parse(a.start) < Date.parse(b.end) + rest ||
      dependencies.get(b.matchId)?.has(a.matchId) && Date.parse(b.start) < Date.parse(a.end) + rest) codes.push("DEPENDENCY_ORDER");
    return codes;
  };
  const withinWindow = (a: ScheduleAssignment) => input.rooms.includes(a.roomId) && Date.parse(a.start) >= Date.parse(input.eventWindow.start) && Date.parse(a.end) <= Date.parse(input.eventWindow.end);
  const restShortfall = (a: ScheduleAssignment) => draft.assignments.filter(b => a.matchId !== b.matchId && shared(a.matchId, b.matchId)).reduce((sum, b) => {
    const gap = Math.max(Date.parse(a.start) - Date.parse(b.end), Date.parse(b.start) - Date.parse(a.end));
    return sum + Math.max(0, preferredRest - gap);
  }, 0);
  const rejected = new Set<string>();
  for (const [index, assignment] of draft.assignments.entries()) {
    if (!withinWindow(assignment)) {
      conflict("OUTSIDE_WINDOW_OR_ROOM", [assignment.matchId], "A fixed assignment is outside the event window or uses an unavailable room.");
      if (!protectedMatch(assignment.matchId)) rejected.add(assignment.matchId);
    }
    for (const other of draft.assignments.slice(index + 1)) {
      const codes = pairCodes(assignment, other);
      codes.forEach(code => conflict(code, [assignment.matchId, other.matchId], "Fixed assignments violate a hard scheduling constraint."));
      if (codes.length) for (const a of [assignment, other]) if (!protectedMatch(a.matchId)) rejected.add(a.matchId);
    }
  }
  draft.assignments = draft.assignments.filter(a => !rejected.has(a.matchId));
  const dependsOn = (target: string, source: string, seen = new Set<string>()): boolean => {
    if (seen.has(target)) return false;
    seen.add(target);
    return [...dependencies.get(target) ?? []].some(id => id === source || dependsOn(id, source, seen));
  };
  pending.filter(m => [m.home, m.away].some(s => s.kind === "match" || s.kind === "group_rank"))
    .forEach(m => draft.warnings.push({ code: "TBD_PARTICIPANTS", matchIds: [m.id], message: "Potential participants reserve rest conservatively until results are resolved." }));
  while (pending.length) {
    const index = pending.findIndex(m => [...dependencies.get(m.id)!].every(id => draft.assignments.some(a => a.matchId === id)));
    if (index < 0) break;
    const match = pending.splice(index, 1)[0];
    const predecessors = [...dependencies.get(match.id)!].map(id => draft.assignments.find(a => a.matchId === id)!);
    const earliest = Math.max(Date.parse(input.eventWindow.start), ...predecessors.map(a => Date.parse(a.end) + rest));
    // Reserve unchanged unrelated games before allocating new slots. Descendants
    // may need to shift when this match moves and are deliberately not reserved.
    let reservations = [...draft.assignments, ...pending.flatMap(m => {
      const old = existing.get(m.id);
      return old && !dependsOn(m.id, match.id) && withinWindow(old) ? [old] : [];
    })];
    const allowed = (a: ScheduleAssignment) => withinWindow(a) && Date.parse(a.start) >= earliest && reservations.every(b => !pairCodes(a, b).length);
    const findCandidates = () => [...input.rooms].sort(compare).flatMap(roomId => [...new Set([rest, preferredRest])].map(targetRest => {
      let start = Math.max(earliest, ...predecessors.map(a => Date.parse(a.end) + targetRest));
      for (const assignment of [...reservations].sort((a, b) => compare(a.start, b.start))) {
        const sameTeam = shared(match.id, assignment.matchId);
        if (assignment.roomId !== roomId && !sameTeam) continue;
        const gap = Math.max(assignment.roomId === roomId ? buffer : 0, sameTeam ? targetRest : 0);
        if (start < Date.parse(assignment.end) + gap && start + duration + gap > Date.parse(assignment.start)) start = Date.parse(assignment.end) + gap;
      }
      return start + duration <= Date.parse(input.eventWindow.end) ? { matchId: match.id, roomId, start: iso(start), end: iso(start + duration) } : null;
    })).filter((a): a is ScheduleAssignment => a !== null).filter(allowed);
    let candidates = findCandidates();
    if (!candidates.length) {
      reservations = [...draft.assignments];
      candidates = findCandidates();
    }
    const old = existing.get(match.id);
    if (old && allowed(old)) candidates.unshift({ ...old });
    const switches = (room: string) => draft.assignments.filter(a => a.roomId !== room && shared(match.id, a.matchId)).length;
    const load = (room: string) => draft.assignments.filter(a => a.roomId === room).length;
    candidates.sort((a, b) => Number(sameAssignment(b, old)) - Number(sameAssignment(a, old)) || restShortfall(a) - restShortfall(b) || compare(a.start, b.start) || switches(a.roomId) - switches(b.roomId) || load(a.roomId) - load(b.roomId) || compare(a.roomId, b.roomId));
    if (candidates[0]) draft.assignments.push(candidates[0]);
    else draft.conflicts.push({ code: "NO_FEASIBLE_SLOT", matchIds: [match.id], message: "No slot satisfies the event window, room, and rest constraints." });
  }
  pending.forEach(m => draft.conflicts.push({ code: "UNRESOLVED_DEPENDENCY", matchIds: [m.id], message: "A prerequisite is missing, cyclic, or unscheduled." }));
  // A manual override may have reserved a slot whose prerequisite subsequently
  // proves impossible. Remove that new proposal and all proposals relying on it.
  let removed = true;
  while (removed) {
    removed = false;
    draft.assignments = draft.assignments.filter(a => {
      const missing = [...dependencies.get(a.matchId) ?? []].some(id => !draft.assignments.some(b => b.matchId === id));
      if (missing) conflict("UNRESOLVED_DEPENDENCY", [a.matchId], "An assigned match has an unscheduled prerequisite.");
      if (missing && !protectedMatch(a.matchId)) { removed = true; return false; }
      return true;
    });
  }
  draft.assignments.sort((a, b) => compare(a.matchId, b.matchId));
  for (const [index, assignment] of draft.assignments.entries()) {
    if (!withinWindow(assignment)) conflict("OUTSIDE_WINDOW_OR_ROOM", [assignment.matchId], "A fixed assignment is outside the event window or uses an unavailable room.");
    for (const other of draft.assignments.slice(index + 1)) {
      pairCodes(assignment, other).forEach(code => conflict(code, [assignment.matchId, other.matchId], "Fixed assignments violate a hard scheduling constraint."));
    }
    if ([...dependencies.get(assignment.matchId) ?? []].some(id => !draft.assignments.some(a => a.matchId === id)))
      conflict("UNRESOLVED_DEPENDENCY", [assignment.matchId], "An assigned match has an unscheduled prerequisite.");
  }
  for (const match of games) {
    const before = existing.get(match.id);
    const after = draft.assignments.find(a => a.matchId === match.id);
    if (!sameAssignment(before, after)) {
      draft.affectedMatchIds.push(match.id);
      draft.impact.push({ matchId: match.id, before: before ? { ...before } : null, after: after ? { ...after } : null,
        delayMinutes: before && after ? (Date.parse(after.start) - Date.parse(before.start)) / 60000 : null });
    }
  }
  draft.assignments.filter(a => restShortfall(a) > 0 && !protectedMatch(a.matchId)).forEach(a => {
    if (draft.assignments.some(b => shared(a.matchId, b.matchId) && Date.parse(b.end) <= Date.parse(a.start)))
      draft.warnings.push({ code: "PREFERRED_REST_UNMET", matchIds: [a.matchId], message: "The preferred rest target could not be met; review the shorter rest interval." });
  });
  draft.warnings.sort((a, b) => compare(a.matchIds[0], b.matchIds[0]) || compare(a.code, b.code));
  draft.conflicts.sort((a, b) => compare(a.matchIds.join("\u0000"), b.matchIds.join("\u0000")) || compare(a.code, b.code));
  draft.feasible = draft.conflicts.length === 0;
  return draft;
}
