// Phase of the admin workspace: import registrations.
// Moved out of admin-workspace.tsx without changes (refactor Phase 4, 4a-admin).

import { PhaseSection, StatusChip, inputClass, labelClass, primaryButton, quietButton } from "@/app/admin/workspace/shared";
import type { AdminTranslator, CaptainUser, EventItem, ImportedTeamItem, RegistrationImportBatchItem, RegistrationImportBatchSummaryItem } from "@/app/admin/workspace/shared";
import { SubmitButton } from "@/components/submit-button";
import { DataTable, Pill, Section } from "@/components/ui";
import { adminAssignCaptainAction } from "@/lib/actions/identity-actions";
import { adminCommitRegistrationImportAction, adminPreviewRegistrationImportAction } from "@/lib/actions/import-actions";
import { adminDeleteTeamAction } from "@/lib/actions/team-actions";
import { getCaptainDisplayName } from "@/lib/team-display";
import { Check, Download, Eye, KeyRound, Upload } from "lucide-react";

export function ImportRegistrationPhase({
  activeEvent,
  captainUsers,
  events,
  importedEventIds,
  importedTeams,
  registrationBatch,
  registrationBatches,
  t,
}: {
  activeEvent: EventItem | undefined;
  captainUsers: CaptainUser[];
  events: EventItem[];
  importedEventIds: Set<string>;
  importedTeams: ImportedTeamItem[];
  registrationBatch: RegistrationImportBatchItem | null;
  registrationBatches: RegistrationImportBatchSummaryItem[];
  t: AdminTranslator;
}) {
  const activeEventHasCredentials = activeEvent ? importedEventIds.has(activeEvent.id) : false;
  const batchSummary = (registrationBatch?.summary ?? {}) as Partial<Record<"new" | "changed" | "same" | "error", number>>;

  return (
    <PhaseSection
      action={
        <div className="flex flex-wrap gap-2">
          <a className={quietButton} href="/templates/registration-import-template.xlsx" download>
            <Download className="h-4 w-4" />
            {t("downloadTemplateXlsx")}
          </a>
          <a className={quietButton} href="/templates/registration-import-template.csv" download>
            <Download className="h-4 w-4" />
            {t("downloadTemplate")}
          </a>
          {activeEvent && activeEventHasCredentials ? (
            <a className={quietButton} href={`/api/admin/captain-credentials?eventId=${activeEvent.id}`}>
              <KeyRound className="h-4 w-4" />
              {t("downloadCredentials")}
            </a>
          ) : null}
        </div>
      }
      description={t("importDescription")}
      title={t("importWorkspaceTitle")}
    >
      <div className="grid min-w-0 gap-5">
        <Section title={t("registrationSourceTitle")} description={t("registrationSourceDescription")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
          {activeEvent ? (
            <form action={adminPreviewRegistrationImportAction} className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,1fr)_minmax(14rem,0.55fr)_minmax(12rem,16rem)] xl:items-end">
              <input type="hidden" name="eventId" value={activeEvent.id} />
              <label className={labelClass}>
                {t("registrationFile")}
                <input
                  className={`${inputClass} block w-full min-w-0 max-w-full overflow-hidden file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200`}
                  name="registrationFile"
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                />
              </label>
              <label className={labelClass}>
                {t("worksheetName")}
                <input
                  className={inputClass}
                  name="worksheetName"
                  placeholder={t("worksheetNamePlaceholder")}
                />
              </label>
              <SubmitButton className={`${primaryButton} min-h-11 w-full px-5`}>
                <Upload className="h-4 w-4" />
                {t("previewRegistration")}
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-slate-500">{t("noEventsImport")}</p>
          )}
          <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
          <ol className="mt-4 grid overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 sm:grid-cols-5">
            {["Upload", "Column Mapping", "Validate", "Preview", "Import"].map((step, index) => (
              <li key={step} className="border-b border-slate-200 px-3 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="mr-2 text-cyan-700">{index + 1}</span>{step}</li>
            ))}
          </ol>
            <div>
              <p className="font-semibold text-slate-900">{t("sourceStep")}</p>
              <p className="mt-1">{t("sourceStepDescription")}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">{t("mappingStep")}</p>
              <p className="mt-1">{t("mappingStepDescription")}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">{t("reviewStep")}</p>
              <p className="mt-1">{t("reviewStepDescription")}</p>
            </div>
          </div>
        </Section>

        {registrationBatch ? (
          <Section title={t("registrationPreviewTitle")} description={t("registrationPreviewDescription")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusChip tone="success">{t("newRows", { count: batchSummary.new ?? 0 })}</StatusChip>
              <StatusChip tone="warning">{t("changedRows", { count: batchSummary.changed ?? 0 })}</StatusChip>
              <StatusChip>{t("sameRows", { count: batchSummary.same ?? 0 })}</StatusChip>
              <StatusChip tone={batchSummary.error ? "warning" : "default"}>{t("errorRows", { count: batchSummary.error ?? 0 })}</StatusChip>
            </div>
            <form action={adminCommitRegistrationImportAction} className="grid gap-4">
              <input type="hidden" name="eventId" value={registrationBatch.eventId} />
              <input type="hidden" name="batchId" value={registrationBatch.id} />
              <DataTable
                columns={["", t("rowLabel"), t("statusLabel"), t("teamLabel"), "Tag", "PIC", t("rosterLabel"), t("issueLabel")]}
                minTableWidth="72rem"
                rows={registrationBatch.items.map((item) => {
                  const normalized = (item.normalizedData ?? {}) as {
                    teamName?: string;
                    teamTag?: string;
                    captainName?: string;
                    captainContact?: string;
                    players?: Array<{ nickname: string }>;
                  };
                  const errors = (item.validationErrors ?? []) as string[];
                  const canSelect = item.status === "new" || item.status === "changed";
                  return [
                    <input
                      key={`${item.id}-select`}
                      aria-label={t("selectImportRow")}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-40"
                      defaultChecked={canSelect}
                      disabled={!canSelect}
                      name="itemId"
                      type="checkbox"
                      value={item.id}
                    />,
                    <span key={`${item.id}-row`} className="mono text-xs text-slate-700">{item.sourceRow}</span>,
                    <Pill key={`${item.id}-status`} tone={item.status === "new" ? "live" : "default"}>
                      {t(`registrationStatuses.${item.status}`)}
                    </Pill>,
                    <span key={`${item.id}-team`} className="font-medium text-slate-800">{normalized.teamName ?? "-"}</span>,
                    <span key={`${item.id}-tag`} className="mono text-xs text-slate-700">{normalized.teamTag ?? "-"}</span>,
                    <span key={`${item.id}-captain`} className="text-slate-700">{normalized.captainName ?? "-"}</span>,
                    <span key={`${item.id}-players`} className="text-slate-700">
                      {normalized.players?.map((player) => player.nickname).join(", ") || "-"}
                    </span>,
                    <span key={`${item.id}-errors`} className="text-xs text-slate-600">
                      {errors.length ? errors.join(" ") : "-"}
                    </span>,
                  ];
                })}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">{t("changedRowsNeedApproval")}</p>
                <SubmitButton
                  className={primaryButton}
                  disabled={(batchSummary.new ?? 0) + (batchSummary.changed ?? 0) === 0}
                >
                  <Check className="h-4 w-4" />
                  {t("commitRegistrationImport")}
                </SubmitButton>
              </div>
            </form>
          </Section>
        ) : null}

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(24rem,0.75fr)_minmax(32rem,1.25fr)]">
          <Section title={t("registrationBatchHistoryTitle")} description={t("registrationBatchHistoryDescription")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
            <DataTable
              columns={[t("sourceLabel"), t("statusLabel"), t("rowsLabel"), ""]}
              minTableWidth="44rem"
              rows={registrationBatches.map((batch) => [
                <span key={`${batch.id}-source`} className="font-medium text-slate-800">{batch.sourceLabel}</span>,
                <Pill key={`${batch.id}-status`} tone={batch.status === "committed" ? "live" : "default"}>
                  {batch.status}
                </Pill>,
                batch.items.length,
                <a
                  key={`${batch.id}-open`}
                  className="inline-flex min-w-max items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-600"
                  href={`?phase=registration&activeEventId=${batch.eventId}&registrationBatchId=${batch.id}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t("openPreview")}
                </a>,
              ])}
            />
            {registrationBatches.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t("noRegistrationBatches")}</p>
            ) : null}
          </Section>

          <Section title={t("importedRegistrationsTitle")} description={t("importedRegistrationsDescription")} className="min-w-0 overflow-hidden rounded-xl shadow-none">
            {importedTeams.length ? (
              <DataTable
                columns={[t("eventLabel"), t("teamLabel"), "Tag", "PIC", t("contactLabel"), t("sourceLabel"), "Kapten Assign", ""]}
                minTableWidth="80rem"
                rows={importedTeams.map((team) => {
                  const eventStatus = events.find((e) => e.id === team.eventId)?.status;
                  return [
                    <span key={`${team.id}-event`} className="font-medium text-slate-800">{team.eventName}</span>,
                    <span key={`${team.id}-team`} className="font-medium text-slate-800">{team.name}</span>,
                    <span key={`${team.id}-tag`} className="mono text-xs text-slate-700">{team.tag}</span>,
                    getCaptainDisplayName(team),
                    <span key={`${team.id}-contact`} className="mono text-xs text-slate-700">{team.captainContact ?? "-"}</span>,
                    team.source ?? "-",
                    <form key={`${team.id}-assign`} action={adminAssignCaptainAction} className="flex items-center gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <select
                        name="captainUserId"
                        defaultValue={team.captainId ?? ""}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="">— Tidak ada —</option>
                        {captainUsers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <SubmitButton className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500">
                        Simpan
                      </SubmitButton>
                    </form>,
                    eventStatus === "Draft" ? (
                      <details key={`${team.id}-delete`} className="relative">
                        <summary className="cursor-pointer text-xs font-medium text-red-600 hover:underline">Hapus</summary>
                        <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                          <p className="mb-2 text-xs text-slate-600">Hapus {team.name}?</p>
                          <form action={adminDeleteTeamAction}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <SubmitButton className="w-full rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">
                              Konfirmasi Hapus
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    ) : <span key={`${team.id}-nodelete`} />,
                  ];
                })}
              />
            ) : (
              <p className="text-sm text-slate-500">{t("noImportedRegistrations")}</p>
            )}
            {activeEvent && activeEventHasCredentials ? (
              <a
                className="mt-4 inline-flex min-w-max items-center gap-1 text-sm font-semibold text-cyan-700 hover:text-cyan-600"
                href={`/api/admin/captain-credentials?eventId=${activeEvent.id}`}
              >
                <KeyRound className="h-4 w-4" />
                {t("downloadCredentials")}
              </a>
            ) : null}
          </Section>
        </div>
      </div>
    </PhaseSection>
  );
}
