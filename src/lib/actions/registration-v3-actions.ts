"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { requireAnyRole } from "@/lib/auth/session";
import {
  assertUserCanManageEvent,
  approveTeamRegistrationRequest,
  commitRegistrationImportBatch,
  getEventPaymentSettingsForManager,
  getRegistrationImportBatchForAdmin,
  getRegistrationImportEventContext,
  getRegistrationImportUsersByEmails,
  getTeamRegistrationRequestForEvent,
  isEventBracketLocked,
  rejectTeamRegistrationRequest,
  saveRegistrationImportPreviewBatch,
} from "@/lib/platform/repository";
import { getGameModeConfig } from "@/lib/platform/config";
import {
  buildRegistrationPreview,
  parseRegistrationSource,
  suggestRegistrationMapping,
  type RegistrationMapping,
  type RegistrationParsedRow,
} from "@/lib/imports/registration-intake";
import {
  publishEventPaymentSettings,
  saveEventPaymentSettingsDraft,
} from "@/lib/registration/event-payment-settings";
import type { AppUser, TeamRegistrationRequestStatus } from "@/lib/platform/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerMilestoneLogger, withServerActionLog, type ServerMilestoneEvent } from "@/lib/observability/logger";

type Locale = "id" | "en";
type BlockedCode =
  | "invalid_input"
  | "unauthorized"
  | "password_change_required"
  | "forbidden"
  | "not_found"
  | "operation_failed"
  | "rate_limited";

export type RegistrationActionBlocked = {
  status: "blocked";
  code: BlockedCode;
  message: string;
  redirectTo?: string;
  legacy?: RegistrationLegacyFailure;
};

export type RegistrationLegacyFailure = {
  phase: "import" | "registration";
  message: string;
  behavior: "redirect" | "throw";
  includeActiveEventId?: boolean;
};

export type RegistrationActionOptions = {
  legacyCompatibility?: boolean;
};

export type RegistrationActionResult =
  | RegistrationActionBlocked
  | { status: "mapping_required"; headers: string[]; mapping: RegistrationMapping; maxRosterSize: number; redirectTo: string }
  | { status: "preview_ready"; batchId: string; redirectTo: string; summary?: unknown; headers?: string[]; mapping?: RegistrationMapping; maxRosterSize?: number; expiresAt?: string; items?: RegistrationPreviewRow[] }
  | { status: "imported"; importedCount: number; redirectTo: string; credentials?: unknown }
  | { status: "approved"; redirectTo: string; team?: unknown }
  | { status: "rejected"; redirectTo: string; request?: unknown }
  | { status: "saved"; version: number; redirectTo: string; settings?: unknown }
  | { status: "published"; version: number; redirectTo: string; settings?: unknown }
  | { status: "conflict"; code: "stale_mutation"; message: string; version?: number; redirectTo?: string };

export type ActionResult = RegistrationActionResult;
export type RegistrationPreviewRow = { id: string; sourceRow: number; teamName: string; status: string; selected: boolean; issueCount: number; issueCodes?: string[] };

function previewIssueCode(issue: unknown): string {
  if (typeof issue !== "string") return "validation";
  if (/formula/i.test(issue)) return "formula";
  if (/terkunci/i.test(issue)) return "locked";
  if (/UID.*duplikat/i.test(issue)) return "duplicate_uid";
  if (/duplikat/i.test(issue)) return "duplicate_team";
  if (/roster.*(batas|minimal)|nickname pemain/i.test(issue)) return "roster_size";
  if (/email.*non-captain/i.test(issue)) return "email_in_use";
  if (/kontak atau email/i.test(issue)) return "captain_contact";
  if (/nama tim/i.test(issue)) return "team_name";
  if (/tag tim/i.test(issue)) return "team_tag";
  if (/Captain (IGN|UID)|nama kapten/i.test(issue)) return "captain_identity";
  return "validation";
}

const idSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
const localeSchema = z.enum(["id", "en"]).default("id");
const MAX_REGISTRATION_INTAKE_BYTES = 5 * 1024 * 1024;

const copy: Record<Locale, Record<string, string>> = {
  id: {
    invalid_input: "Input registrasi tidak valid.",
    unauthorized: "Sesi organizer tidak ditemukan.",
    password_change_required: "Ganti password sebelum mengelola registrasi.",
    forbidden: "Kamu tidak memiliki akses ke event ini.",
    not_found: "Data registrasi tidak ditemukan.",
    operation_failed: "Perubahan registrasi tidak dapat disimpan.",
    rate_limited: "Terlalu banyak percobaan. Coba lagi nanti.",
    stale_mutation: "Data registrasi sudah berubah. Muat ulang lalu coba lagi.",
    preview_ready: "Preview import siap ditinjau.",
    imported: "Registrasi berhasil diimport.",
    approved: "Pembayaran disetujui.",
    rejected: "Pembayaran ditolak.",
    saved: "QRIS event disimpan sebagai draft.",
    published: "QRIS event dipublikasikan.",
  },
  en: {
    invalid_input: "Registration input is invalid.",
    unauthorized: "An organizer session is required.",
    password_change_required: "Change your password before managing registration.",
    forbidden: "You do not have access to this event.",
    not_found: "The registration data was not found.",
    operation_failed: "The registration change could not be saved.",
    rate_limited: "Too many attempts. Try again later.",
    stale_mutation: "The registration changed. Reload and try again.",
    preview_ready: "The import preview is ready for review.",
    imported: "Registration import completed.",
    approved: "Payment approved.",
    rejected: "Payment rejected.",
    saved: "The event QRIS was saved as a draft.",
    published: "The event QRIS was published.",
  },
};

function localizedMessage(locale: Locale, key: string) {
  return copy[locale][key] ?? copy[locale].operation_failed;
}

function blocked(locale: Locale, code: BlockedCode, redirectTo?: string): RegistrationActionBlocked {
  return { status: "blocked", code, message: localizedMessage(locale, code), ...(redirectTo ? { redirectTo } : {}) };
}

function withLegacyFailure(
  result: RegistrationActionBlocked,
  options: RegistrationActionOptions,
  failure: RegistrationLegacyFailure,
): RegistrationActionBlocked {
  return options.legacyCompatibility ? { ...result, legacy: failure } : result;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function listValues(formData: FormData, key: string) {
  return formData.getAll(key).map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}

function localeFrom(formData: FormData): Locale {
  const parsed = localeSchema.safeParse(value(formData, "locale") || "id");
  return parsed.success ? parsed.data : "id";
}

function canonicalRegistrationPath(locale: Locale, eventId: string, rawReturnTo: string, defaultView: string) {
  const fallback = `/${locale}/organizer/events/${eventId}/registration?view=${encodeURIComponent(defaultView)}`;
  if (!rawReturnTo || !rawReturnTo.startsWith("/") || rawReturnTo.startsWith("//")) return fallback;
  if (/[\\#\u0000]/.test(rawReturnTo) || /\.\.|%2e|%2f|%5c/i.test(rawReturnTo)) return fallback;

  try {
    const parsed = new URL(rawReturnTo, "https://registration.invalid");
    if (parsed.origin !== "https://registration.invalid") return fallback;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const withoutLocale = segments[0] === "id" || segments[0] === "en" ? segments.slice(1) : segments;
    if (
      withoutLocale.length !== 4
      || withoutLocale[0] !== "organizer"
      || withoutLocale[1] !== "events"
      || withoutLocale[2] !== eventId
      || withoutLocale[3] !== "registration"
    ) return fallback;

    const allowed = new Set(["view", "status", "source", "q", "page"]);
    const query = new URLSearchParams();
    for (const [key, item] of parsed.searchParams.entries()) {
      if (allowed.has(key)) query.set(key, item);
    }
    if (!query.has("view")) query.set("view", defaultView);
    const serialized = query.toString();
    return `/${locale}/organizer/events/${eventId}/registration${serialized ? `?${serialized}` : ""}`;
  } catch {
    return fallback;
  }
}

function registrationPath(locale: Locale, eventId: string) {
  return `/${locale}/organizer/events/${eventId}/registration`;
}

async function gate(eventId: string): Promise<AppUser | RegistrationActionBlocked> {
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return blocked("id", "unauthorized");
  if (user.role === "organizer" && user.mustChangePassword) return blocked("id", "password_change_required");
  try {
    await assertUserCanManageEvent(user, eventId);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authorized") return blocked("id", "forbidden");
    throw error;
  }
  return user;
}

function isConflict(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "stale_mutation") return true;
  return error instanceof Error && /stale|conflict|changed|already reviewed/i.test(error.message);
}

function isUnauthorized(error: unknown) {
  return error instanceof Error && error.message === "Not authorized";
}

function asErrorResult(locale: Locale, error: unknown): RegistrationActionBlocked | { status: "conflict"; code: "stale_mutation"; message: string } {
  if (isConflict(error)) return { status: "conflict", code: "stale_mutation", message: localizedMessage(locale, "stale_mutation") };
  if (isUnauthorized(error)) return blocked(locale, "forbidden");
  return blocked(locale, "operation_failed");
}

type PreviewInput = {
  locale: Locale;
  eventId: string;
  returnTo: string;
  worksheetName?: string;
  file: File;
};

type RegistrationImportTrace = (stage: string, event?: ServerMilestoneEvent) => void;

const REGISTRATION_IMPORT_ACTION_OPERATION = "registration_import_preview";
const REGISTRATION_IMPORT_ACTION_ROUTE = "/server-actions/registration/import/preview";

function actionResultMilestone(result: RegistrationActionResult): ServerMilestoneEvent {
  const failed = result.status === "blocked" && result.code === "operation_failed";
  return failed ? { status: 500, terminal: "failed", errorCode: "operation_failed" } : { status: 200 };
}

function readPreviewInput(formData: FormData): PreviewInput | RegistrationActionBlocked {
  const locale = localeFrom(formData);
  const parsed = z.object({
    eventId: idSchema,
    returnTo: z.string().max(2_000).optional(),
    worksheetName: z.string().trim().max(200).optional(),
  }).safeParse({
    eventId: value(formData, "eventId"),
    returnTo: value(formData, "returnTo") || undefined,
    worksheetName: value(formData, "worksheetName") || undefined,
  });
  const file = formData.get("registrationFile");
  if (!parsed.success || !(file instanceof File) || file.size === 0) return blocked(locale, "invalid_input");
  return { locale, eventId: parsed.data.eventId, returnTo: parsed.data.returnTo ?? "", worksheetName: parsed.data.worksheetName, file };
}

export async function previewRegistrationImportForUser(
  user: AppUser,
  formData: FormData,
  options: RegistrationActionOptions = {},
  trace?: RegistrationImportTrace,
): Promise<RegistrationActionResult> {
  const input = readPreviewInput(formData);
  if ("status" in input) return input;
  const { locale, eventId, file } = input;
  const redirectTo = canonicalRegistrationPath(locale, eventId, input.returnTo, "import");
  if (!(await checkRateLimit(`registration-import:${user.id}:${eventId}`, 5, 15 * 60 * 1000))) {
    return withLegacyFailure(blocked(locale, "rate_limited", redirectTo), options, {
      phase: "import", message: localizedMessage(locale, "rate_limited"), behavior: "redirect",
    });
  }
  try {
    await assertUserCanManageEvent(user, eventId);
    if (file.size > MAX_REGISTRATION_INTAKE_BYTES) {
      return withLegacyFailure(blocked(locale, "invalid_input", redirectTo), options, {
        phase: "import", message: "File registrasi maksimal 5 MiB.", behavior: "redirect",
      });
    }
    const lowerName = file.name.toLowerCase();
    const kind = lowerName.endsWith(".xlsx") ? "xlsx" : lowerName.endsWith(".csv") ? "csv" : null;
    if (!kind) {
      return withLegacyFailure(blocked(locale, "invalid_input", redirectTo), options, {
        phase: "import", message: "File harus berformat .xlsx atau .csv.", behavior: "redirect",
      });
    }

    const event = await getRegistrationImportEventContext(user, eventId);
    trace?.("event_context_done", { locale, resourceId: eventId, status: event ? 200 : 404 });
    if (!event) {
      return withLegacyFailure(blocked(locale, "not_found", redirectTo), options, {
        phase: "import", message: "Event tidak ditemukan.", behavior: "redirect", includeActiveEventId: false,
      });
    }

    let parsed;
    try {
      parsed = await parseRegistrationSource({
        kind,
        fileName: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        worksheetName: input.worksheetName,
      });
      trace?.("source_parsed", { locale, resourceId: eventId, counts: { rowCount: parsed.worksheets[0]?.rows.length ?? 0 } });
    } catch (error) {
      if (options.legacyCompatibility) {
        return withLegacyFailure(blocked(locale, "invalid_input", redirectTo), options, {
          phase: "import",
          message: errorMessage(error, "File registrasi tidak dapat dibaca."),
          behavior: "redirect",
        });
      }
      return asErrorResult(locale, error);
    }
    const worksheet = parsed.worksheets[0];
    if (!worksheet || worksheet.rows.length < 2) {
      return withLegacyFailure(blocked(locale, "invalid_input", redirectTo), options, {
        phase: "import", message: "File perlu header dan minimal satu baris registrasi.", behavior: "redirect",
      });
    }

    const mode = getGameModeConfig(event.gameModeId);
    const headers = worksheet.rows[0].map((cell) => cell.value);
    if (!options.legacyCompatibility && worksheet.rows.length > 501) return blocked(locale, "invalid_input", redirectTo);
    let mapping = suggestRegistrationMapping(headers, { maxRosterSize: mode.maxRosterSize });
    const rawMapping = value(formData, "mapping");
    if (rawMapping && !options.legacyCompatibility) {
      const column = z.number().int().min(0).max(headers.length - 1).optional();
      const schema = z.object({
        columns: z.object({ teamName: column, teamTag: column, captainName: column, captainContact: column, captainEmail: column, captainIgn: column, captainUid: column, captainIsPlayer: column }).strict(),
        players: z.array(z.object({ nickname: column, displayName: column, position: column }).strict()).max(mode.maxRosterSize),
      }).strict();
      try {
        const parsedMapping = schema.safeParse(JSON.parse(rawMapping));
        if (!parsedMapping.success) return blocked(locale, "invalid_input", redirectTo);
        const used = [...Object.values(parsedMapping.data.columns), ...parsedMapping.data.players.flatMap(player => Object.values(player))].filter(column => column !== undefined);
        if (new Set(used).size !== used.length) return blocked(locale, "invalid_input", redirectTo);
        mapping = parsedMapping.data;
      } catch { return blocked(locale, "invalid_input", redirectTo); }
    }
    const required = [
      ["teamName", "nama tim"],
      ["captainIgn", "captain IGN"],
      ["captainUid", "captain UID"],
    ] as const;
    const missingRequired = required
      .filter(([key]) => mapping.columns[key] == null)
      .map(([, label]) => label);
    if (missingRequired.length > 0) {
      if (!options.legacyCompatibility) return { status: "mapping_required", headers, mapping, maxRosterSize: mode.maxRosterSize, redirectTo };
      return withLegacyFailure(blocked(locale, "invalid_input", redirectTo), options, {
        phase: "registration",
        message: `Mapping wajib belum ditemukan: ${missingRequired.join(", ")}.`,
        behavior: "redirect",
      });
    }

    const rows: RegistrationParsedRow[] = worksheet.rows.slice(1).map((row, index) => ({
      sourceRow: index + 2,
      cells: row.map((cell) => cell.value),
      formulaColumns: row.map((cell, columnIndex) => cell.formula ? columnIndex : -1).filter((columnIndex) => columnIndex >= 0),
    }));
    const emailColumn = mapping.columns.captainEmail;
    const emailValues = emailColumn == null
      ? []
      : rows.map((row) => row.cells[emailColumn]?.trim().toLowerCase()).filter((item): item is string => Boolean(item));
    const existingUsers = emailValues.length && typeof getRegistrationImportUsersByEmails === "function"
      ? await getRegistrationImportUsersByEmails(user, eventId, emailValues)
      : [];
    trace?.("users_resolved", { locale, resourceId: eventId, counts: { userCount: existingUsers.length } });
    const bracketLocked = await isEventBracketLocked(event.id);
    trace?.("bracket_lock_done", { locale, resourceId: eventId, counts: { locked: bracketLocked ? 1 : 0 } });
    const preview = buildRegistrationPreview({
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        participantCap: event.participantCap,
        bracketLocked,
        maxRosterSize: mode.maxRosterSize,
        minRosterSize: mode.teamSize,
      },
      existingTeams: event.teams.map((team) => ({
        id: team.id,
        name: team.name,
        tag: team.tag,
        captainName: team.captainName,
        captainContact: team.captainContact,
        players: team.players,
      })),
      existingUsers,
      rows,
      mapping,
    });
    const batch = await saveRegistrationImportPreviewBatch({
      user,
      eventId,
      sourceKind: parsed.sourceKind,
      sourceLabel: file.name,
      worksheetName: worksheet.name,
      headerSignature: headers.join("|").toLowerCase(),
      mapping,
      items: preview.items,
      summary: preview.summary,
    });
    trace?.("preview_batch_saved", { locale, resourceId: eventId, counts: { itemCount: batch.items?.length ?? preview.items.length } });
    if (options.legacyCompatibility) return { status: "preview_ready", batchId: batch.id, redirectTo, summary: preview.summary };
    return {
      status: "preview_ready", batchId: batch.id, redirectTo, summary: preview.summary,
      headers, mapping, maxRosterSize: mode.maxRosterSize, expiresAt: batch.expiresAt?.toISOString(),
      items: (batch.items ?? []).slice(0, 500).map(item => ({
        id: item.id, sourceRow: item.sourceRow, status: item.status, selected: item.selected,
        teamName: typeof item.normalizedData === "object" && item.normalizedData !== null && !Array.isArray(item.normalizedData) && typeof item.normalizedData.teamName === "string" ? item.normalizedData.teamName.slice(0, 200) : "",
        issueCount: Array.isArray(item.validationErrors) ? item.validationErrors.length : 0,
        issueCodes: Array.isArray(item.validationErrors) ? [...new Set(item.validationErrors.map(previewIssueCode))] : [],
      })),
    };
  } catch (error) {
    if (options.legacyCompatibility) throw error;
    return asErrorResult(locale, error);
  }
}

function readCommitInput(formData: FormData) {
  const locale = localeFrom(formData);
  const parsed = z.object({
    eventId: idSchema,
    batchId: idSchema,
    returnTo: z.string().max(2_000).optional(),
  }).safeParse({
    eventId: value(formData, "eventId"),
    batchId: value(formData, "batchId"),
    returnTo: value(formData, "returnTo") || undefined,
  });
  if (!parsed.success) return { input: null, locale } as const;
  const selectedItemIds = listValues(formData, "itemId");
  return { input: { ...parsed.data, selectedItemIds }, locale } as const;
}

export async function commitRegistrationImportForUser(
  user: AppUser,
  formData: FormData,
  options: RegistrationActionOptions = {},
): Promise<RegistrationActionResult> {
  const parsed = readCommitInput(formData);
  if (!parsed.input) return blocked(parsed.locale, "invalid_input");
  const { eventId, batchId, selectedItemIds, returnTo } = parsed.input;
  const redirectTo = canonicalRegistrationPath(parsed.locale, eventId, returnTo ?? "", "import");
  if (!(await checkRateLimit(`registration-import:${user.id}:${eventId}`, 5, 15 * 60 * 1000))) {
    return withLegacyFailure(blocked(parsed.locale, "rate_limited", redirectTo), options, {
      phase: "registration", message: localizedMessage(parsed.locale, "rate_limited"), behavior: "redirect",
    });
  }
  if (selectedItemIds.length === 0) {
    return withLegacyFailure(blocked(parsed.locale, "invalid_input", redirectTo), options, {
      phase: "registration",
      message: "Pilih minimal satu baris Baru atau Berubah untuk diimport.",
      behavior: "redirect",
    });
  }
  try {
    await assertUserCanManageEvent(user, eventId);
    const batch = await getRegistrationImportBatchForAdmin(user, batchId);
    if (!batch) {
      return withLegacyFailure(blocked(parsed.locale, "not_found", redirectTo), options, {
        phase: "registration", message: "Batch import registrasi tidak ditemukan.", behavior: "redirect",
      });
    }
    if (batch.eventId !== eventId) return blocked(parsed.locale, "forbidden", redirectTo);
    const result = await commitRegistrationImportBatch(user, batchId, selectedItemIds);
    return { status: "imported", importedCount: result.importedCount, credentials: result.credentials, redirectTo };
  } catch (error) {
    if (options.legacyCompatibility) {
      const result = asErrorResult(parsed.locale, error);
      const blockedResult = result.status === "blocked"
        ? result
        : blocked(parsed.locale, "operation_failed", redirectTo);
      return withLegacyFailure(blockedResult, options, {
        phase: "registration", message: errorMessage(error, "Import registrasi gagal."), behavior: "redirect",
      });
    }
    return asErrorResult(parsed.locale, error);
  }
}

type ReviewInput = {
  locale: Locale;
  eventId: string;
  requestId: string;
  expectedUpdatedAt: Date;
  returnTo: string;
  reason?: string;
};

function readReviewInput(formData: FormData, requireReason: boolean): ReviewInput | RegistrationActionBlocked {
  const locale = localeFrom(formData);
  const reason = value(formData, "reason");
  const rawVersion = value(formData, "version");
  const parsed = z.object({
    eventId: idSchema,
    requestId: idSchema,
    version: z.string().min(1).refine((item) => Number.isFinite(Date.parse(item))),
    returnTo: z.string().max(2_000).optional(),
    reason: z.string().trim().min(3).max(240).optional(),
  }).safeParse({
    eventId: value(formData, "eventId"),
    requestId: value(formData, "requestId"),
    version: rawVersion,
    returnTo: value(formData, "returnTo") || undefined,
    reason: reason || undefined,
  });
  if (!parsed.success || requireReason && !parsed.data.reason) return blocked(locale, "invalid_input");
  return {
    locale,
    eventId: parsed.data.eventId,
    requestId: parsed.data.requestId,
    expectedUpdatedAt: new Date(parsed.data.version),
    returnTo: parsed.data.returnTo ?? "",
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
  };
}

async function readReviewTarget(user: AppUser, input: ReviewInput, locale: Locale, expected: TeamRegistrationRequestStatus | TeamRegistrationRequestStatus[]) {
  const target = await getTeamRegistrationRequestForEvent(user, input.eventId, input.requestId);
  if (!target) return blocked(locale, "not_found");
  if (target.eventId !== input.eventId) return blocked(locale, "forbidden");
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(target.status) || target.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { status: "conflict", code: "stale_mutation", message: localizedMessage(locale, "stale_mutation") } as const;
  }
  return target;
}

export async function approveEventPaymentAction(formData: FormData): Promise<ActionResult> {
  const input = readReviewInput(formData, false);
  if ("status" in input) return input;
  const access = await gate(input.eventId);
  if ("status" in access) return { ...access, message: localizedMessage(input.locale, access.code) };
  const redirectTo = canonicalRegistrationPath(input.locale, input.eventId, input.returnTo, "payments");
  try {
    const target = await readReviewTarget(access, input, input.locale, "pending_review");
    if (target.status === "blocked" || target.status === "conflict") return { ...target, redirectTo };
    const team = await approveTeamRegistrationRequest(access, input.requestId, {
      expectedStatus: "pending_review",
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    revalidateTag("teams");
    revalidateTag("events");
    return { status: "approved", team, redirectTo };
  } catch (error) {
    const result = asErrorResult(input.locale, error);
    return "status" in result && result.status === "conflict" ? { ...result, redirectTo } : result;
  }
}

export async function rejectEventPaymentAction(formData: FormData): Promise<ActionResult> {
  const input = readReviewInput(formData, true);
  if ("status" in input) return input;
  const access = await gate(input.eventId);
  if ("status" in access) return { ...access, message: localizedMessage(input.locale, access.code) };
  const redirectTo = canonicalRegistrationPath(input.locale, input.eventId, input.returnTo, "payments");
  try {
    const target = await readReviewTarget(access, input, input.locale, ["pending_review", "pending_payment"]);
    if (target.status === "blocked" || target.status === "conflict") return { ...target, redirectTo };
    const request = await rejectTeamRegistrationRequest(access, input.requestId, input.reason!, {
      expectedStatus: target.status,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    revalidateTag("teams");
    revalidateTag("events");
    return { status: "rejected", request, redirectTo };
  } catch (error) {
    const result = asErrorResult(input.locale, error);
    return "status" in result && result.status === "conflict" ? { ...result, redirectTo } : result;
  }
}

type QrisInput = {
  locale: Locale;
  eventId: string;
  expectedVersion: number;
  qrisImageUrl?: string | null;
  instructions?: string | null;
  returnTo: string;
};

function readQrisInput(formData: FormData, includeContent: boolean): QrisInput | RegistrationActionBlocked {
  const locale = localeFrom(formData);
  const rawVersion = value(formData, "expectedVersion");
  const parsed = z.object({
    eventId: idSchema,
    expectedVersion: z.string().min(1).refine((item) => Number.isInteger(Number(item)) && Number(item) >= 0),
    qrisImageUrl: z.string().max(2_048).optional(),
    instructions: z.string().max(500).optional(),
    returnTo: z.string().max(2_000).optional(),
  }).safeParse({
    eventId: value(formData, "eventId"),
    expectedVersion: rawVersion,
    qrisImageUrl: includeContent ? value(formData, "qrisImageUrl") || undefined : undefined,
    instructions: includeContent ? value(formData, "instructions") || undefined : undefined,
    returnTo: value(formData, "returnTo") || undefined,
  });
  if (!parsed.success) return blocked(locale, "invalid_input");
  return {
    locale,
    eventId: parsed.data.eventId,
    expectedVersion: Number(parsed.data.expectedVersion),
    ...(includeContent ? { qrisImageUrl: parsed.data.qrisImageUrl ?? null, instructions: parsed.data.instructions ?? null } : {}),
    returnTo: parsed.data.returnTo ?? "",
  };
}

export async function saveEventQrisDraftAction(formData: FormData): Promise<ActionResult> {
  const input = readQrisInput(formData, true);
  if ("status" in input) return input;
  const access = await gate(input.eventId);
  if ("status" in access) return { ...access, message: localizedMessage(input.locale, access.code) };
  const redirectTo = canonicalRegistrationPath(input.locale, input.eventId, input.returnTo, "qris");
  if (!(await checkRateLimit(`registration-qris:${access.id}:${input.eventId}`, 5, 15 * 60 * 1000))) {
    return blocked(input.locale, "rate_limited", redirectTo);
  }
  let uploaded: Awaited<ReturnType<typeof import("@/lib/actions").uploadImageAsset>> | undefined;
  let stored = false;
  try {
    const current = await getEventPaymentSettingsForManager(access, input.eventId);
    if (current.eventId !== input.eventId) return blocked(input.locale, "forbidden", redirectTo);
    const file = formData.get("qrisImage");
    if (file instanceof File && file.size > 0) {
      if ((current.version ?? 0) !== input.expectedVersion) return { status: "conflict", code: "stale_mutation", version: current.version, message: localizedMessage(input.locale, "stale_mutation"), redirectTo };
      const { uploadImageAsset } = await import("@/lib/actions");
      const asset = await uploadImageAsset({ file, folder: "event-payment-qris", entityId: input.eventId, label: "QRIS", maxBytes: MAX_REGISTRATION_INTAKE_BYTES, validationMode: "throw" });
      uploaded = asset;
      input.qrisImageUrl = asset.url;
    }
    const result = await saveEventPaymentSettingsDraft({
      eventId: input.eventId,
      actor: access,
      expectedVersion: input.expectedVersion,
      qrisImageUrl: input.qrisImageUrl,
      instructions: input.instructions,
    });
    if (result.status === "conflict") return { status: "conflict", code: "stale_mutation", version: result.version, message: localizedMessage(input.locale, "stale_mutation"), redirectTo };
    stored = true;
    return { status: "saved", version: result.settings.version ?? input.expectedVersion + 1, settings: result.settings, redirectTo };
  } catch (error) {
    const result = asErrorResult(input.locale, error);
    return "status" in result && result.status === "conflict" ? { ...result, redirectTo } : result;
  } finally {
    // The object is immutable and was created by this call; never delete the previous QRIS.
    if (uploaded && !stored && uploaded.storageKey?.startsWith(`event-payment-qris/${input.eventId}-`)) {
      try {
        if (uploaded.storageProvider === "vercel_blob") { const { del } = await import("@vercel/blob"); await del(uploaded.url); }
        else if (uploaded.storageProvider === "local") {
          const path = await import("node:path"); const fs = await import("node:fs/promises");
          const folder = path.resolve(process.cwd(), "public", "event-payment-qris");
          const target = path.resolve(process.cwd(), "public", uploaded.storageKey);
          if (path.dirname(target) === folder) await fs.unlink(target);
        }
      } catch { console.warn("Event QRIS upload cleanup failed", { eventId: input.eventId }); }
    }
  }
}

export async function publishEventQrisAction(formData: FormData): Promise<ActionResult> {
  const input = readQrisInput(formData, false);
  if ("status" in input) return input;
  const access = await gate(input.eventId);
  if ("status" in access) return { ...access, message: localizedMessage(input.locale, access.code) };
  const redirectTo = canonicalRegistrationPath(input.locale, input.eventId, input.returnTo, "qris");
  try {
    const current = await getEventPaymentSettingsForManager(access, input.eventId);
    if (current.eventId !== input.eventId) return blocked(input.locale, "forbidden", redirectTo);
    const result = await publishEventPaymentSettings({ eventId: input.eventId, actor: access, expectedVersion: input.expectedVersion });
    if (result.status === "conflict") return { status: "conflict", code: "stale_mutation", version: result.version, message: localizedMessage(input.locale, "stale_mutation"), redirectTo };
    return { status: "published", version: result.settings.version ?? input.expectedVersion + 1, settings: result.settings, redirectTo };
  } catch (error) {
    const result = asErrorResult(input.locale, error);
    return "status" in result && result.status === "conflict" ? { ...result, redirectTo } : result;
  }
}

async function previewEventRegistrationImportActionImpl(formData: FormData, requestId: string): Promise<ActionResult> {
  const locale = localeFrom(formData);
  const rawEventId = value(formData, "eventId");
  const trace = createServerMilestoneLogger({
    operation: REGISTRATION_IMPORT_ACTION_OPERATION,
    route: REGISTRATION_IMPORT_ACTION_ROUTE,
    requestId,
  });
  trace("action_enter", { locale, resourceId: rawEventId || undefined });
  const input = readPreviewInput(formData);
  if ("status" in input) {
    trace("action_return", { locale, resourceId: rawEventId || undefined, ...actionResultMilestone(input) });
    return input;
  }
  let access: AppUser | RegistrationActionBlocked;
  try {
    access = await gate(input.eventId);
  } catch (error) {
    trace("action_return", { locale: input.locale, resourceId: input.eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
    throw error;
  }
  trace("access_gate_done", { locale: input.locale, resourceId: input.eventId, status: "status" in access ? 403 : 200 });
  if ("status" in access) {
    trace("action_return", { locale: input.locale, resourceId: input.eventId, ...actionResultMilestone(access) });
    return { ...access, message: localizedMessage(input.locale, access.code) };
  }
  let result: ActionResult;
  try {
    result = await previewRegistrationImportForUser(access, formData, {}, trace);
    if (result.status === "preview_ready") {
      revalidatePath(registrationPath(input.locale, input.eventId));
      trace("revalidation_requested", { locale: input.locale, resourceId: input.eventId });
    }
  } catch (error) {
    trace("action_return", { locale: input.locale, resourceId: input.eventId, status: 500, terminal: "failed", errorCode: "internal_error" });
    throw error;
  }
  trace("action_return", { locale: input.locale, resourceId: input.eventId, ...actionResultMilestone(result) });
  return result;
}

export async function previewEventRegistrationImportAction(formData: FormData): Promise<ActionResult> {
  return withServerActionLog(
    REGISTRATION_IMPORT_ACTION_OPERATION,
    REGISTRATION_IMPORT_ACTION_ROUTE,
    ({ requestId }) => previewEventRegistrationImportActionImpl(formData, requestId),
  );
}

export async function commitEventRegistrationImportAction(formData: FormData): Promise<ActionResult> {
  const parsed = readCommitInput(formData);
  if (!parsed.input) return blocked(parsed.locale, "invalid_input");
  const access = await gate(parsed.input.eventId);
  if ("status" in access) return { ...access, message: localizedMessage(parsed.locale, access.code) };
  const result = await commitRegistrationImportForUser(access, formData);
  if (result.status === "imported") {
    revalidateTag("teams");
    revalidatePath(registrationPath(parsed.locale, parsed.input.eventId));
  }
  return result;
}
