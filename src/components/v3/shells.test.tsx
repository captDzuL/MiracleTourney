import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EventWorkspaceShell } from "./EventWorkspaceShell";
import { OperatorShell } from "./OperatorShell";
import { PublicShell } from "./PublicShell";
import { SiteFooter } from "./SiteFooter";

Object.assign(globalThis, { React });

describe("Miracle V3 shells", () => {
  it("keeps the public primary navigation centered and exposes a skip link", () => {
    const html = renderToStaticMarkup(
      <PublicShell
        brandHref="/id"
        navigation={[{ href: "/id/events", label: "Event", active: true }]}
        actions={<button type="button">Masuk</button>}
        footer={<div>Footer</div>}
      >
        <h1>Beranda</h1>
      </PublicShell>,
    );

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('aria-label="Navigasi utama"');
    expect(html).toContain("md:grid-cols-[1fr_auto_1fr]");
    expect(html).toContain('aria-current="page"');
  });

  it("provides desktop sidebar navigation and a labelled mobile menu", () => {
    const html = renderToStaticMarkup(
      <OperatorShell
        homeHref="/id/organizer"
        navigation={[{ href: "/id/organizer/events", label: "Event saya", active: true }]}
        mobileMenuLabel="Buka navigasi"
        footer={<div>Footer</div>}
      >
        <h1>Organizer</h1>
      </OperatorShell>,
    );

    expect(html).toContain('aria-label="Navigasi operator"');
    expect(html).toContain('aria-label="Buka navigasi"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("lg:grid-cols-[var(--sidebar-width-operator)_minmax(0,1fr)]");
  });

  it("keeps event context and the next useful action visible", () => {
    const html = renderToStaticMarkup(
      <EventWorkspaceShell
        eventTitle="Flash Peak Championship"
        organizerLabel="Flash Peak Organizer"
        navigation={[{ href: "/overview", label: "Ringkasan", active: true }]}
        nextAction={<button type="button">Lengkapi format</button>}
      >
        <p>Workspace</p>
      </EventWorkspaceShell>,
    );

    expect(html).toContain("Flash Peak Championship");
    expect(html).toContain("Flash Peak Organizer");
    expect(html).toContain('aria-label="Navigasi event"');
    expect(html).toContain('aria-label="Tindakan berikutnya"');
  });

  it("renders Miracle copyright and only supplied social contacts", () => {
    const html = renderToStaticMarkup(
      <SiteFooter
        copyright="Copyright © Miracle"
        tagline="Platform turnamen komunitas multi-game"
        socialLabel="Kontak sosial"
        socials={[{ href: "https://instagram.com/miracle", label: "Instagram" }]}
      />,
    );

    expect(html).toContain("Copyright © Miracle");
    expect(html).toContain('href="https://instagram.com/miracle"');
    expect(html).toContain("Instagram");
    expect(html).not.toContain("TikTok");
  });

  it("keeps the existing shell as rollback when the V3 flag is disabled", () => {
    const source = readFileSync(join(process.cwd(), "src", "components", "shell.tsx"), "utf8");
    expect(source).toContain('isFeatureEnabled("ui_v3_foundation")');
    expect(source).toContain("<V3ShellRouter");
    expect(source).toContain('isFeatureEnabled("public_visual_v2")');
  });
});
