"use client";

import type { TournamentFormatConfig } from "@/lib/tournament/formats/types";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";

type FormatConfiguratorProps = {
  allowAdvanced?: boolean;
  value: TournamentFormatConfig | null;
  onChange: (value: TournamentFormatConfig) => void;
};

const formatOptions = [
  { kind: "single_elimination", label: "Single Elimination", preset: TOURNAMENT_FORMAT_PRESETS.singleElimination },
  { kind: "double_elimination", label: "Double Elimination", preset: TOURNAMENT_FORMAT_PRESETS.doubleElimination },
  { kind: "round_robin", label: "Round Robin", preset: TOURNAMENT_FORMAT_PRESETS.roundRobin },
  { kind: "group_playoffs", label: "Group + Playoffs", preset: TOURNAMENT_FORMAT_PRESETS.groupPlayoffs },
] as const;

function advancedTitle(value: TournamentFormatConfig) {
  switch (value.kind) {
    case "single_elimination": return "Bracket rounds";
    case "double_elimination": return "Upper and lower brackets";
    case "round_robin": return "League rules";
    case "group_playoffs": return "Group stage and playoffs";
  }
}

const selectClass = "min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]";
const labelClass = "grid gap-2 text-sm font-bold text-[var(--color-text)]";
const bestOfOptions = [1, 3, 5, 7];

function BestOfSelect({ label, name, value, onChange }: { label: string; name: string; value: number; onChange: (value: number) => void }) {
  return <label className={labelClass}>{label}<select className={selectClass} name={name} onChange={(event) => onChange(Number(event.target.value))} value={value}>
    {bestOfOptions.map((option) => <option key={option} value={option}>BO{option}</option>)}
  </select></label>;
}

function AdvancedFormatControls({ value, onChange }: FormatConfiguratorProps & { value: TournamentFormatConfig }) {
  if (value.kind === "single_elimination") return <div className="grid gap-3 min-[700px]:grid-cols-2">
    {([
      ["earlyRounds", "Early rounds"], ["semifinals", "Semifinals"], ["thirdPlace", "Third place"], ["final", "Final"],
    ] as const).map(([field, label]) => <BestOfSelect key={field} label={label} name={field} value={value.bestOf[field]} onChange={(bestOf) => onChange({ ...value, bestOf: { ...value.bestOf, [field]: bestOf } })} />)}
  </div>;

  if (value.kind === "double_elimination") return <div className="grid gap-3 min-[700px]:grid-cols-2">
    {([
      ["earlyRounds", "Early rounds"], ["upperFinal", "Upper final"], ["lowerFinal", "Lower final"], ["grandFinal", "Grand final"],
    ] as const).map(([field, label]) => <BestOfSelect key={field} label={label} name={field} value={value.bestOf[field]} onChange={(bestOf) => onChange({ ...value, bestOf: { ...value.bestOf, [field]: bestOf } })} />)}
  </div>;

  if (value.kind === "round_robin") return <label className={labelClass}>Meetings per team pair<select className={selectClass} name="legs" onChange={(event) => onChange({ ...value, legs: Number(event.target.value) as 1 | 2 })} value={value.legs}>
    <option value="1">Once</option><option value="2">Twice</option>
  </select></label>;

  const validQualifiers = [1, 2, 4].filter((qualifiers) => {
    const total = value.groupCount * qualifiers;
    return total >= 4 && (total & (total - 1)) === 0;
  });
  return <div className="grid gap-3 min-[700px]:grid-cols-2">
    <label className={labelClass}>Group count<select className={selectClass} name="groupCount" onChange={(event) => {
      const groupCount = Number(event.target.value);
      const qualifiersPerGroup = [1, 2, 4].find((qualifiers) => {
        const total = groupCount * qualifiers;
        return total >= 4 && (total & (total - 1)) === 0;
      }) ?? value.qualifiersPerGroup;
      onChange({ ...value, groupCount, qualifiersPerGroup });
    }} value={value.groupCount}>
      {[2, 4, 8, 16].map((count) => <option key={count} value={count}>{count} groups</option>)}
    </select></label>
    <label className={labelClass}>Qualifiers per group<select className={selectClass} name="qualifiersPerGroup" onChange={(event) => onChange({ ...value, qualifiersPerGroup: Number(event.target.value) })} value={value.qualifiersPerGroup}>
      {validQualifiers.map((count) => <option key={count} value={count}>Top {count}</option>)}
    </select></label>
    <label className={labelClass}>Group meetings<select className={selectClass} name="groupStageLegs" onChange={(event) => onChange({ ...value, groupStage: { ...value.groupStage, legs: Number(event.target.value) as 1 | 2 } })} value={value.groupStage.legs}>
      <option value="1">Once</option><option value="2">Twice</option>
    </select></label>
    <label className={labelClass}>Playoff bracket<select className={selectClass} name="playoffKind" onChange={(event) => onChange({
      ...value,
      playoffs: event.target.value === "double_elimination"
        ? {
            version: 1, kind: "double_elimination",
            bestOf: { earlyRounds: 1, upperFinal: 3, lowerFinal: 3, grandFinal: 5 },
            thirdPlace: "lower_final_loser", avoidImmediateGroupRematches: true,
          }
        : {
            version: 1, kind: "single_elimination",
            bestOf: { earlyRounds: 1, semifinals: 3, thirdPlace: 1, final: 5 },
            thirdPlace: "required", avoidImmediateGroupRematches: true,
          },
    })} value={value.playoffs.kind}>
      <option value="single_elimination">Single Elimination</option><option value="double_elimination">Double Elimination</option>
    </select></label>
  </div>;
}

export function FormatConfigurator({ allowAdvanced = true, value, onChange }: FormatConfiguratorProps) {
  const availableOptions = allowAdvanced ? formatOptions : formatOptions.slice(0, 1);
  return <section aria-labelledby="format-heading" className="grid gap-4">
    <div>
      <h2 id="format-heading" className="text-lg font-extrabold text-[var(--color-text)]">Competition format</h2>
      <p className="mt-1 text-sm text-[var(--color-text-subtle)]">Choose how teams progress through the tournament.</p>
    </div>
    <div aria-label="Competition format" className="grid gap-3 sm:grid-cols-2" role="group">
      {availableOptions.map((option) => <button
        aria-pressed={value?.kind === option.kind}
        className="min-h-20 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left text-sm font-bold text-[var(--color-text)] aria-pressed:border-[var(--color-brand-violet)] aria-pressed:bg-[var(--color-surface-strong)]"
        data-format-kind={option.kind}
        key={option.kind}
        onClick={() => onChange(option.preset)}
        type="button"
      >{option.label}</button>)}
    </div>
    {value && (allowAdvanced || value.kind === "single_elimination") && <fieldset data-advanced-format className="grid gap-3 border-t border-[var(--color-border)] pt-4">
      <legend className="pr-3 text-sm font-bold text-[var(--color-text)]">{advancedTitle(value)}</legend>
      <p className="text-sm text-[var(--color-text-subtle)]">Adjust the supported rules before publishing.</p>
      <AdvancedFormatControls onChange={onChange} value={value} />
    </fieldset>}
  </section>;
}