import * as React from "react";

type PublicRosterPlayer = {
  id: string;
  nickname: string;
  displayName: string;
  position: string;
};

export function PublicParticipantRoster({ players, locale }: { players: PublicRosterPlayer[]; locale: "id" | "en" }) {
  const isIndonesian = locale === "id";

  return (
    <ul className="mt-5 grid min-w-0 gap-3">
      {players.map((player) => {
        const position = player.position.trim();
        const hasPosition = position !== "" && position.toLowerCase() !== "unassigned";

        return (
          <li key={player.id} className="min-w-0 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] p-4">
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">UID</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere] font-bold">{player.displayName.trim() ? player.displayName : (isIndonesian ? "UID belum tersedia" : "UID unavailable")}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">IGN</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere] font-bold">{player.nickname}</dd>
              </div>
              {hasPosition ? <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{isIndonesian ? "Posisi" : "Position"}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">{player.position}</dd>
              </div> : null}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
