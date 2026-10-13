import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./CaptainLoginDialog", () => ({ CaptainLoginDialog: ({ triggerLabel }: { triggerLabel: string }) => <button>CAPTAIN-DIALOG {triggerLabel}</button> }));

import type { AdaptiveRegistrationEventViewModel, RegistrationCta, RegistrationViewerState } from "@/lib/events/adaptive-public-event";
import { RegistrationEntryCta } from "./RegistrationEntryCta";

Object.assign(globalThis, { React });

function view(mode: "team" | "solo", cta: RegistrationCta, state: RegistrationViewerState = "anonymous") {
  return {
    mode: "registration",
    event: { id: "event-1", slug: "solo-cup", name: "Solo Cup" },
    registration: { mode },
    viewer: { state, cta },
  } as unknown as AdaptiveRegistrationEventViewModel;
}

const registerPath = encodeURIComponent("/events/solo-cup/register");
const render = (v: AdaptiveRegistrationEventViewModel, locale: "id" | "en" = "id") =>
  renderToStaticMarkup(<RegistrationEntryCta view={v} locale={locale} />);

describe("RegistrationEntryCta for a solo event", () => {
  const login: RegistrationCta = { kind: "login", label: "register_solo", enabled: true };

  it("sends a visitor to sign in, or to make a player account, and back to the event", () => {
    const html = render(view("solo", login));
    expect(html).toContain(`href="/id/login?returnTo=${registerPath}"`);
    expect(html).toContain(`href="/id/register?as=player&amp;returnTo=${registerPath}"`);
    expect(html).toContain("Masuk untuk daftar solo");
    expect(html).toContain("Buat akun pemain");
  });

  it("does not offer the captain login dialog", () => {
    expect(render(view("solo", login))).not.toContain("CAPTAIN-DIALOG");
  });

  it("speaks English with English routes", () => {
    const html = render(view("solo", login), "en");
    expect(html).toContain(`href="/en/login?returnTo=${registerPath}"`);
    expect(html).toContain("Sign in to join solo");
    expect(html).toContain("Create a player account");
  });

  it.each([
    [{ kind: "start", label: "register_solo", href: "/events/solo-cup/register", enabled: true }, "Daftar solo", "Join solo"],
    [{ kind: "status", label: "view_queue_position", href: "/events/solo-cup/register", enabled: true }, "Lihat posisi antrean", "See your place in the queue"],
    [{ kind: "continue", label: "continue_payment", href: "/events/solo-cup/register", enabled: true }, "Lanjutkan pembayaran", "Continue payment"],
    [{ kind: "start", label: "register_again", href: "/events/solo-cup/register", enabled: true }, "Daftar ulang", "Register again"],
  ] as const)("links the player to the event page for %j", (cta, indonesian, english) => {
    expect(render(view("solo", cta, "eligible_without_team"))).toContain(`href="/id/events/solo-cup/register"`);
    expect(render(view("solo", cta, "eligible_without_team"))).toContain(indonesian);
    expect(render(view("solo", cta, "eligible_without_team"), "en")).toContain(english);
  });

  it("tells a captain to use a player account instead of a captain account", () => {
    const cta: RegistrationCta = { kind: "disabled", label: "use_player_account", reason: "player_account_required", enabled: false };
    const html = render(view("solo", cta, "wrong_role"));
    expect(html).toContain("disabled");
    expect(html).toContain("Gunakan akun Pemain");
    expect(html).toContain("Keluar dari akun ini lalu masuk menggunakan akun Pemain.");
    expect(html).not.toContain("Captain");
    expect(render(view("solo", cta, "wrong_role"), "en")).toContain("Sign out, then sign in with a Player account.");
  });

  it("shows a closed or upcoming event as a disabled button without the account hint", () => {
    const cta: RegistrationCta = { kind: "disabled", label: "registration_closed", reason: "registration_closed", enabled: false };
    const html = render(view("solo", cta, "eligible_without_team"));
    expect(html).toContain("Pendaftaran ditutup");
    expect(html).not.toContain("Keluar dari akun ini");
  });
});

describe("RegistrationEntryCta for a team event", () => {
  it("still opens the captain login dialog", () => {
    const html = render(view("team", { kind: "login", label: "register_team", enabled: true }));
    expect(html).toContain("CAPTAIN-DIALOG Daftarkan tim");
  });

  it("still warns a wrong account to use a captain account", () => {
    const cta: RegistrationCta = { kind: "disabled", label: "use_captain_account", reason: "captain_account_required", enabled: false };
    expect(render(view("team", cta, "wrong_role"))).toContain("Keluar dari akun ini lalu masuk menggunakan akun Captain.");
  });
});
