"use client";

import { useMemo, useState } from "react";

import { createEventV3Action } from "@/lib/actions/event-v3-actions";

type GameModeOption = { id: string; label: string };
type OrganizerOption = { id: string; name: string; email: string };
type OwnerKind = "platform" | "existing_organizer" | "new_organizer";
type FormatKind = "single_elimination" | "double_elimination" | "round_robin" | "group_playoffs";

const caps = [8, 12, 16, 24, 32, 64, 128, 256];
const steps = ["Identity", "Format & schedule", "Registration", "Visuals", "Review & publish"];

export function CreateEventWizard({
  locale,
  role,
  gameModes,
  organizers = [],
  competitionOperationsEnabled,
}: {
  locale: "id" | "en";
  role: "organizer" | "platform_admin" | "admin";
  gameModes: GameModeOption[];
  organizers?: OrganizerOption[];
  competitionOperationsEnabled: boolean;
}) {
  const [step, setStep] = useState(0);
  const [formatKind, setFormatKind] = useState<FormatKind>("single_elimination");
  const [capacity, setCapacity] = useState(16);
  const [groups, setGroups] = useState(4);
  const [advance, setAdvance] = useState(2);
  const [ownerKind, setOwnerKind] = useState<OwnerKind>("platform");
  const isAdmin = role !== "organizer";
  const formatOptions: Array<{ value: FormatKind; title: string; description: string }> = [
    { value: "single_elimination", title: "Single Elimination", description: "One loss eliminates a team; add a third-place match later if needed." },
    ...(competitionOperationsEnabled ? [
      { value: "double_elimination" as const, title: "Double Elimination", description: "Upper and lower brackets give teams a second chance." },
      { value: "round_robin" as const, title: "Round Robin", description: "Every team meets in one standings table." },
      { value: "group_playoffs" as const, title: "Group + Playoffs", description: "Group standings seed the final elimination bracket." },
    ] : []),
  ];
  const preview = useMemo(() => {
    if (formatKind === "round_robin") return { title: "Round-Robin League", matches: capacity * (capacity - 1) / 2, summary: `${capacity - 1} matchweeks · podium from standings` };
    if (formatKind === "group_playoffs") {
      const groupSize = capacity / groups;
      const qualified = groups * advance;
      const valid = Number.isInteger(groupSize) && advance < groupSize && [4, 8, 16, 32].includes(qualified);
      const groupMatches = Number.isInteger(groupSize) ? groups * groupSize * (groupSize - 1) / 2 : 0;
      return { title: "Group + Playoffs", matches: valid ? groupMatches + qualified - 1 : 0, summary: valid ? `${groups} groups · top ${advance} qualify · ${qualified}-team playoffs` : "Adjust groups and qualifiers to a valid playoff field" };
    }
    if (formatKind === "double_elimination") return { title: "Double Elimination", matches: capacity * 2 - 2, summary: "Upper and lower bracket · lower-final loser takes third place" };
    return { title: "Single Elimination", matches: capacity - 1, summary: "Third-place match is optional in the workspace" };
  }, [advance, capacity, formatKind, groups]);

  return <form action={createEventV3Action} className="grid gap-6">
    <input name="locale" type="hidden" value={locale} />
    {isAdmin ? <input name="ownerKind" type="hidden" value={ownerKind} /> : null}
    <ol aria-label="Create event steps" className="grid gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-text-subtle)] min-[700px]:grid-cols-5">
      {steps.map((label, index) => <li className={index === step ? "border-b-2 border-[var(--color-brand-cyan)] pb-2 text-[var(--color-text)]" : "border-b border-[var(--color-border)] pb-2"} key={label}>{index + 1}. {label}</li>)}
    </ol>
    <div className="grid gap-6 min-[1024px]:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid gap-6 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 min-[700px]:p-7">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]">Private draft</p>
          <h1 className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">Create a new event</h1>
          <p className="mt-3 text-[var(--color-text-subtle)]">Start with identity and structure. Your Draft remains private until review and publication.</p>
        </header>
        <div className="grid gap-4 min-[700px]:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Event name<input autoComplete="off" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" minLength={3} name="name" placeholder="Miracle Community Cup" required /></label>
          <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Public URL slug<input autoComplete="off" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" minLength={3} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="miracle-community-cup" required /></label>
          <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Game & mode<select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" defaultValue={gameModes[0]?.id} name="gameModeId" required>{gameModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Participant capacity<select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="participantCap" onChange={(event) => setCapacity(Number(event.target.value))} value={capacity}>{caps.map((cap) => <option key={cap} value={cap}>{cap} teams</option>)}</select></label>
        </div>
        {isAdmin ? <fieldset className="grid gap-3 border-t border-[var(--color-border)] pt-5"><legend className="text-sm font-extrabold text-[var(--color-text)]">Event ownership</legend><div className="grid gap-2"><label className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-3"><input checked={ownerKind === "platform"} name="owner-choice" onChange={() => setOwnerKind("platform")} type="radio" value="platform" /> <b className="ml-2">Event Miracle</b><span className="ml-2 text-sm text-[var(--color-text-subtle)]">Published as by Miracle.</span></label><label className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-3"><input checked={ownerKind === "existing_organizer"} name="owner-choice" onChange={() => setOwnerKind("existing_organizer")} type="radio" value="existing" /> <b className="ml-2">Existing organizer</b></label>{ownerKind === "existing_organizer" ? <select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="organizerUserId" required><option value="">Select organizer</option>{organizers.map((organizer) => <option key={organizer.id} value={organizer.id}>{organizer.name} · {organizer.email}</option>)}</select> : null}<label className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-3"><input checked={ownerKind === "new_organizer"} name="owner-choice" onChange={() => setOwnerKind("new_organizer")} type="radio" value="new" /> <b className="ml-2">New organizer</b></label>{ownerKind === "new_organizer" ? <div className="grid gap-3 min-[700px]:grid-cols-2"><input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="organizerName" placeholder="Organization name" required /><input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="organizerAccountName" placeholder="Account name" required /><input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="organizerEmail" placeholder="Email" required type="email" /><input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="temporaryPassword" placeholder="Temporary password" required type="password" /><input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="organizerContactChannel" placeholder="Contact channel" required /><input className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="organizerContactValue" placeholder="Contact value" required /></div> : null}</div></fieldset> : null}
        <fieldset className="grid gap-3 border-t border-[var(--color-border)] pt-5"><legend className="text-sm font-extrabold text-[var(--color-text)]">Competition format</legend><div className="grid gap-3 min-[700px]:grid-cols-2">{formatOptions.map((option) => <label className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-4" key={option.value}><input checked={formatKind === option.value} className="mt-1" name="formatKind" onChange={() => setFormatKind(option.value)} type="radio" value={option.value} /><span className="font-extrabold text-[var(--color-text)]">{option.title}</span><span className="col-start-2 text-sm text-[var(--color-text-subtle)]">{option.description}</span></label>)}</div></fieldset>
        {formatKind === "group_playoffs" ? <div className="grid gap-4 min-[700px]:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Groups<select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="groupCount" onChange={(event) => setGroups(Number(event.target.value))} value={groups}>{[2, 4, 8].map((value) => <option key={value} value={value}>{value} groups</option>)}</select></label><label className="grid gap-2 text-sm font-bold text-[var(--color-text)]">Advance per group<select className="min-h-11 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3" name="qualifiersPerGroup" onChange={(event) => setAdvance(Number(event.target.value))} value={advance}>{[1, 2, 4].map((value) => <option key={value} value={value}>Top {value}</option>)}</select></label></div> : null}
        <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--color-border)] pt-5"><button className="min-h-11 border border-[var(--color-border)] px-4 text-sm font-extrabold text-[var(--color-text)]" onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">Back</button><div className="flex gap-3"><button className="min-h-11 border border-[var(--color-border)] px-4 text-sm font-extrabold text-[var(--color-text)]" onClick={() => setStep((current) => Math.min(4, current + 1))} type="button">Next</button><button className="min-h-11 bg-[var(--color-brand-violet)] px-5 font-extrabold text-white" type="submit">Create private draft</button></div></div>
      </section>
      <aside className="h-fit grid gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-5 min-[1024px]:sticky min-[1024px]:top-6" data-format-preview>
        <div className="flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--color-brand-cream)]"><span>Live structure preview</span><span>Draft · private</span></div>
        <div><h2 className="text-xl font-extrabold text-[var(--color-text)]">{preview.title}</h2><p className="mt-2 text-sm text-[var(--color-text-subtle)]">{preview.summary}</p></div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-border)]"><div className="bg-[var(--color-surface)] p-3"><dt className="text-xs text-[var(--color-text-subtle)]">Teams</dt><dd className="mt-1 text-xl font-extrabold text-[var(--color-text)]">{capacity}</dd></div><div className="bg-[var(--color-surface)] p-3"><dt className="text-xs text-[var(--color-text-subtle)]">Matches</dt><dd className="mt-1 text-xl font-extrabold text-[var(--color-text)]">{preview.matches}</dd></div></dl>
        <div className="border-t border-[var(--color-border)] pt-4"><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Public page sample</p><p className="mt-2 text-sm font-bold text-[var(--color-text)]">Your event will show its game, format, registration window, and trusted organizer identity here.</p></div>
      </aside>
    </div>
  </form>;
}