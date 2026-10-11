import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Refactor PR 0.7: which server actions refresh which cached pages.
//
// Every function in a "use server" file that calls revalidatePath or revalidateTag is listed below with the exact
// calls it makes. The scan reads all "use server" files, and the table is keyed by function name, so moving an action
// to another file keeps the test green but dropping, adding or changing a call fails it. Update the table only when
// the change in cache behavior is intended.
//
// Notation: path(/, layout) = revalidatePath("/", "layout"), tag(events) = revalidateTag("events"). Arguments that are
// not literals are shown as written. Order does not matter, repeats do. A call inside a callback belongs to the
// top-level function that contains it, so the Impl functions behind the exported actions are listed too.
//
// This checks the code, not that a call runs for a given input; behavior is covered by the action tests.
const EXPECTED: Record<string, string[]> = {
  // lib/actions.ts
  adminActivateEventVisualAction: ['path(/, layout)', 'tag(events)'],
  adminApproveEventVisualAction: ['path(/, layout)', 'tag(events)'],
  adminApprovePaymentAction: ['path(/admin)', 'path(/captain)', 'tag(events)', 'tag(teams)'],
  adminApproveStatAction: ['path(/, layout)'],
  adminArchiveEventAction: ['path(/, layout)'],
  adminAssignCaptainAction: ['path(/, layout)'],
  adminCommitRegistrationImportAction: ['path(/, layout)', 'tag(teams)'],
  adminCreateEventAction: ['path(/, layout)', 'tag(events)'],
  adminDeactivateUserAction: ['path(/, layout)'],
  adminDeleteTeamAction: ['path(/, layout)'],
  adminImportTeamsCsvAction: ['path(/, layout)'],
  adminPreviewRegistrationImportAction: ['path(/, layout)'],
  adminRegenerateCertificateAction: ['path(/admin)', 'path(/admin)'],
  adminRejectEventVisualAction: ['path(/, layout)', 'tag(events)'],
  adminRejectPaymentAction: ['path(/admin)', 'path(/captain)'],
  adminRejectStatAction: ['path(/, layout)'],
  adminSaveMatchPlayerStatsAction: ['path(/, layout)', 'tag(stats)'],
  adminSetAccentColorAction: ['path(/admin)'],
  adminSetEventVisualFocalPointAction: ['path(/, layout)', 'tag(events)'],
  adminSetMatchGamesAction: ['path(/, layout)', 'tag(events)', 'tag(teams)'],
  adminSetRoundConfigAction: ['path(/, layout)', 'tag(teams)'],
  adminUpdateEventPublicInfoAction: ['path(/, layout)', 'tag(events)'],
  adminUpdateEventStatusAction: ['path(/, layout)', 'path(/, layout)', 'tag(events)', 'tag(events)'],
  adminUpdateMatchResultAction: ['path(/, layout)', 'tag(events)', 'tag(teams)'],
  adminUpdatePaymentSettingsAction: ['path(/admin)'],
  adminUpdateStreamAction: ['path(/, layout)'],
  adminUploadCharacterArtAction: ['path(/admin)'],
  adminUploadTeamLogoAction: ['path(/, layout)', 'tag(teams)'],
  captainDeletePlayerAction: ['path(/captain)'],
  captainRegisterTeamAction: ['path(/captain)', 'path(/captain)', 'tag(teams)', 'tag(teams)'],
  captainSaveDraftTeamAction: ['path(/captain)', 'tag(teams)'],
  captainSetDisplayCaptainAction: ['path(/, layout)'],
  captainSubmitStatsAction: ['path(/captain/stats)'],
  captainUpdatePlayerAction: ['path(/captain)'],
  captainUploadPaymentProofAction: ['path(/captain)'],
  captainUploadTeamLogoAction: ['path(/captain)', 'tag(teams)'],
  uploadEventLogo: ['path(/, layout)', 'tag(events)'],
  uploadEventVisual: ['path(/, layout)', 'tag(events)'],
  // lib/actions/certificate-v3-actions.ts
  publishCertificateSetActionImpl: ['path(/organizer/events/${parsed.data.eventId}/certificates)'],
  regenerateCertificateActionImpl: ['path(/organizer/events/${parsed.data.eventId}/certificates)'],
  uploadCertificateAssetActionImpl: ['path(/organizer/events/ + parsed.data.eventId + /certificates)'],
  // lib/actions/competition-v3-actions.ts
  executeCompetitionOperationActionImpl: ['path(/, layout)', 'tag(events)'],
  // lib/actions/completion-v3-actions.ts
  completeTournamentActionImpl: ['path(/organizer/events/${eventId}/completion)'],
  reopenTournamentActionImpl: ['path(/organizer/events/${eventId}/completion)'],
  // lib/actions/event-revision-actions.ts
  refreshEventSurfaces: ['path(/, layout)', 'path(/admin/events/ + eventId)', 'path(/organizer/events/ + eventId)', 'tag(events)'],
  // lib/actions/event-v3-actions.ts
  createEventPreviewActionImpl: ['path(/organizer/events/ + parsed.eventId)'],
  createEventV3ActionImpl: ['tag(events)', 'tag(events)', 'tag(events)', 'tag(events)'],
  publishEventV3ActionImpl: ['path(/, layout)', 'path(/organizer/events/ + parsed.eventId)', 'tag(events)'],
  revokeEventPreviewActionImpl: ['path(/organizer/events/ + parsed.eventId)'],
  saveEventDraftActionImpl: ['path(/, layout)', 'tag(events)'],
  updateEventOrganizerContactActionImpl: ['path(/organizer/events/ + parsed.eventId)'],
  // lib/actions/organizer-profile-actions.ts
  completeOrganizerPasswordChangeActionImpl: ['path(/organizer)'],
  updateOrganizerProfileActionImpl: ['path(/organizer)', 'path(/organizer/profile)', 'tag(events)'],
  // lib/actions/platform-profile-actions.ts
  updatePlatformProfileActionImpl: ['path(/admin)', 'tag(events)'],
  // lib/actions/player-stats-v3-actions.ts
  mutateImpl: ['path(/${locale}/captain/stats)', 'path(/${locale}/organizer/events/${encodeURIComponent(guard.eventId)}/match-control)', 'path(path)', 'path(path)', 'tag(events)', 'tag(stats)'],
  // lib/actions/registration-v3-actions.ts
  approveEventPaymentAction: ['tag(events)', 'tag(teams)'],
  commitEventRegistrationImportAction: ['path(registrationPath(parsed.locale, parsed.input.eventId))', 'tag(teams)'],
  previewEventRegistrationImportActionImpl: ['path(registrationPath(input.locale, input.eventId))'],
  rejectEventPaymentAction: ['tag(events)', 'tag(teams)'],
  // lib/registration/actions.ts
  captainRegisterEventTeamActionImpl: ['path(/events/${safeSlug})', 'path(/events/${safeSlug}/register)', 'tag(teams)'],
};

const SRC_DIR = path.resolve(__dirname, "..");
const USE_SERVER_DIRECTIVE = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function normalize(call: string) {
  return call
    .replace(/^revalidate(Path|Tag)/, (_match, kind: string) => kind.toLowerCase())
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ");
}

function topLevelName(node: ts.Node, sourceFile: ts.SourceFile) {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name && current.parent === sourceFile) return current.name.text;
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.parent.parent.parent === sourceFile) {
      return current.name.text;
    }
  }
  return "<module>";
}

function scanRevalidationCalls() {
  const found: Record<string, { calls: string[]; files: string[] }> = {};
  for (const file of sourceFiles(SRC_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    if (!USE_SERVER_DIRECTIVE.test(text)) continue;
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^revalidate(Path|Tag)$/.test(node.expression.text)) {
        const name = topLevelName(node, sourceFile);
        const entry = (found[name] ??= { calls: [], files: [] });
        entry.calls.push(normalize(node.getText(sourceFile)));
        const relative = path.relative(SRC_DIR, file).split(path.sep).join("/");
        if (!entry.files.includes(relative)) entry.files.push(relative);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return found;
}

describe("revalidation map of server actions", () => {
  const found = scanRevalidationCalls();

  it("scans the server action files and finds the functions it is meant to guard", () => {
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(50);
    expect(found.adminUpdateEventStatusAction?.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps every function name in one file, so the table is unambiguous", () => {
    const ambiguous = Object.entries(found)
      .filter(([, entry]) => entry.files.length > 1)
      .map(([name]) => name);
    expect(ambiguous).toEqual([]);
  });

  it("matches the table: no call dropped, added or changed", () => {
    const actual = Object.fromEntries(Object.entries(found).map(([name, entry]) => [name, [...entry.calls].sort()]));
    const expected = Object.fromEntries(Object.entries(EXPECTED).map(([name, calls]) => [name, [...calls].sort()]));

    const missing = Object.keys(expected).filter((name) => !(name in actual));
    const unexpected = Object.keys(actual).filter((name) => !(name in expected));
    const changed = Object.keys(actual)
      .filter((name) => name in expected && JSON.stringify(actual[name]) !== JSON.stringify(expected[name]))
      .map((name) => ({ name, expected: expected[name], actual: actual[name] }));

    expect({ missing, unexpected, changed }).toEqual({ missing: [], unexpected: [], changed: [] });
  });
});
