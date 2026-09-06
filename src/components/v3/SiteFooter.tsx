import React from "react";
import type { ReactNode } from "react";

export type SocialContact = {
  href: string;
  label: string;
};

export type SiteFooterProps = {
  copyright: string;
  tagline: string;
  socialLabel?: string;
  socials?: SocialContact[];
};

export function SiteFooter({ copyright, tagline, socialLabel = "Social", socials = [] }: SiteFooterProps) {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
      <div className="mx-auto flex w-full max-w-[var(--content-width-public)] flex-col gap-4 px-4 py-6 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-[var(--color-text)]">{copyright}</p>
          <p>{tagline}</p>
        </div>
        {socials.length > 0 ? (
          <nav aria-label={socialLabel} className="flex flex-wrap gap-x-4 gap-y-2">
            {socials.map((social) => (
              <a
                key={`${social.label}-${social.href}`}
                className="font-semibold text-[var(--color-text)] underline-offset-4 hover:text-[var(--color-brand-cyan)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                href={social.href}
                rel="noreferrer"
                target="_blank"
              >
                {social.label}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
