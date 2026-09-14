import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PublicV3NavigationItem = { href: string; label: string; active?: boolean };
export type PublicV3Tone = "cyan" | "violet" | "cream" | "muted";

export function PublicV3Eyebrow({ children, tone = "cyan", className }: { children: ReactNode; tone?: PublicV3Tone; className?: string }) {
  return <span className={cn("mpv3-eyebrow", `mpv3-${tone}`, className)}>{children}</span>;
}

/** Status keys drive appearance only. Callers supply localized, truthful copy. */
export function PublicV3StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return <span className={cn("mpv3-badge", className)} data-status={status}><span className="mpv3-dot" aria-hidden="true" />{label}</span>;
}

export type PublicV3ActionProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string | null | undefined;
  variant?: "primary" | "secondary" | "cyan" | "text";
};

/** Hrefs arrive localized; an absent destination never becomes a # link. */
export function PublicV3Action({ href, variant = "secondary", className, children, ...props }: PublicV3ActionProps) {
  const classes = cn("mpv3-action", `mpv3-action--${variant}`, className);
  if (!href?.trim()) return <span className={classes} aria-disabled="true">{children}</span>;
  return <a {...props} className={classes} href={href}>{children}</a>;
}

export function PublicV3Button({ className, type = "button", ...props }: ComponentPropsWithoutRef<"button">) {
  return <button {...props} type={type} className={cn("mpv3-action mpv3-action--secondary", className)} />;
}

export type PublicV3Fact = { label: string; value: string | number | null | undefined; fallback?: string };
function factValue(value: PublicV3Fact["value"], fallback: string) {
  return value == null || (typeof value === "string" && !value.trim()) || (typeof value === "number" && !Number.isFinite(value)) ? fallback : value;
}

export function PublicV3FactStrip({ facts, action, fallback = "TBD" }: { facts: readonly PublicV3Fact[]; action?: ReactNode; fallback?: string }) {
  return <div className="mpv3-fact-strip"><dl className="mpv3-facts">{facts.map((fact) => <div className="mpv3-fact" key={fact.label}><dt>{fact.label}</dt><dd>{factValue(fact.value, fact.fallback ?? fallback)}</dd></div>)}</dl>{action && <div className="mpv3-fact-action">{action}</div>}</div>;
}

export function PublicV3SectionHeading({ title, eyebrow, number, description, action, id }: { title: string; eyebrow?: string; number?: string; description?: string; action?: ReactNode; id?: string }) {
  return <div className="mpv3-section-head"><div>{eyebrow && <PublicV3Eyebrow>{eyebrow}</PublicV3Eyebrow>}<h2 id={id}>{number && <span className="mpv3-section-number" aria-hidden="true">{number}</span>}{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function PublicV3Count({ value, label, fallback = "TBD" }: { value: number | null | undefined; label: string; fallback?: string }) {
  return <div className="mpv3-count"><strong>{factValue(value, fallback)}</strong><span>{label}</span></div>;
}

/** Route tabs use links/current-page semantics rather than ARIA tab widgets. */
export function PublicV3Tabs({ label, items, variant = "underline" }: { label: string; items: readonly PublicV3NavigationItem[]; variant?: "underline" | "segmented" }) {
  return <nav className={cn("mpv3-tabs", `mpv3-tabs--${variant}`)} aria-label={label}>{items.map((item) => <a key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</a>)}</nav>;
}

export function PublicV3Filter({ label, options, className, id, ...props }: ComponentPropsWithoutRef<"select"> & { id: string; label: string; options: readonly { value: string; label: string }[] }) {
  return <div className={cn("mpv3-field", className)}><label htmlFor={id}>{label}</label><select {...props} id={id}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

export function PublicV3EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="mpv3-empty-state"><h2>{title}</h2><p>{description}</p>{action}</section>;
}

export function PublicV3CompactEventIdentity({ name, href, eyebrow, monogram, status }: { name: string; href?: string | null; eyebrow?: string; monogram?: string; status?: ReactNode }) {
  return <div className="mpv3-event-compact">{monogram && <span className="mpv3-event-monogram" aria-hidden="true">{monogram}</span>}<div className="mpv3-event-compact-copy">{eyebrow && <PublicV3Eyebrow tone="muted">{eyebrow}</PublicV3Eyebrow>}<h2>{href ? <a href={href}>{name}</a> : name}</h2></div>{status}</div>;
}
