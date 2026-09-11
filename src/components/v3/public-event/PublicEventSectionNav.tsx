"use client";

import { useEffect, useRef, useState } from "react";

export const PUBLIC_EVENT_SECTION_IDS = [
  "summary",
  "participants",
  "requirements",
  "organizer",
] as const;

export type PublicEventSectionId = typeof PUBLIC_EVENT_SECTION_IDS[number];

function sectionFromHash(): PublicEventSectionId {
  const candidate = window.location.hash.slice(1);
  return PUBLIC_EVENT_SECTION_IDS.includes(candidate as PublicEventSectionId)
    ? candidate as PublicEventSectionId
    : "summary";
}

export function PublicEventSectionNav({ labels }: {
  labels: Record<PublicEventSectionId, string>;
}) {
  const [activeSection, setActiveSection] = useState<PublicEventSectionId>("summary");
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    setActiveSection(sectionFromHash());

    const targets = PUBLIC_EVENT_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter((target): target is HTMLElement => Boolean(target));

    const observer = new IntersectionObserver((entries) => {
      const closest = entries
        .filter((entry) => entry.isIntersecting && PUBLIC_EVENT_SECTION_IDS.includes(entry.target.id as PublicEventSectionId))
        .sort((left, right) => Math.abs(left.boundingClientRect.top - 144) - Math.abs(right.boundingClientRect.top - 144))[0];
      if (closest) setActiveSection(closest.target.id as PublicEventSectionId);
    }, {
      rootMargin: "-120px 0px -65% 0px",
      threshold: [0, 0.1, 1],
    });

    targets.forEach((target) => observer.observe(target));

    const restoreHash = () => setActiveSection(sectionFromHash());
    window.addEventListener("hashchange", restoreHash);
    window.addEventListener("popstate", restoreHash);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", restoreHash);
      window.removeEventListener("popstate", restoreHash);
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  function selectSection(id: PublicEventSectionId) {
    const target = document.getElementById(id);
    if (!target) return;

    setActiveSection(id);
    window.history.pushState(null, "", `#${id}`);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });

    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    document.querySelectorAll<HTMLElement>("[data-section-highlighted]")
      .forEach((element) => delete element.dataset.sectionHighlighted);
    target.dataset.sectionHighlighted = "true";
    highlightTimer.current = window.setTimeout(() => {
      delete target.dataset.sectionHighlighted;
      highlightTimer.current = null;
    }, 1200);
  }

  return <nav
    aria-label="Navigasi bagian event"
    className="sticky top-0 z-30 -mx-4 overflow-x-auto border-y border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_94%,transparent)] px-4 backdrop-blur sm:mx-0 sm:px-0"
  >
    <div className="flex min-w-max gap-2 py-2 text-sm font-bold sm:gap-5">
      {PUBLIC_EVENT_SECTION_IDS.map((id) => {
        const active = activeSection === id;
        return <a
          key={id}
          href={`#${id}`}
          aria-current={active ? "location" : undefined}
          onClick={(event) => {
            event.preventDefault();
            selectSection(id);
          }}
          className={`relative flex min-h-11 items-center rounded-t-[var(--radius-control)] border-b-2 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] ${active
            ? "border-[var(--color-brand-violet)] text-[var(--color-brand-cyan)]"
            : "border-transparent text-[var(--color-text)] hover:text-[var(--color-brand-cyan)]"
          }`}
        >
          {labels[id]}
        </a>;
      })}
    </div>
  </nav>;
}
