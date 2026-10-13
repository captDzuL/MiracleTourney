import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoloRegisterForm } from "./SoloRegisterForm";

Object.assign(globalThis, { React });

const positions = ["Forward", "Midfielder", "Defender", "Goalkeeper"];
const action = async () => {
  throw new Error("not called");
};

function render(props: Partial<React.ComponentProps<typeof SoloRegisterForm>> = {}) {
  return renderToStaticMarkup(
    <SoloRegisterForm action={action as never} eventId="event-1" feeLabel="Rp25.000" locale="id" positions={positions} requiredPosition="Goalkeeper" {...props} />,
  );
}

const input = (html: string, name: string) => html.match(new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`))?.[0] ?? "";

describe("SoloRegisterForm", () => {
  it("asks for everything the draw needs, each with a label tied to its field", () => {
    const html = render();
    for (const name of ["ign", "uid", "primaryPosition", "secondaryPosition", "willingCaptain", "whatsapp", "shareContact"]) {
      const field = input(html, name);
      expect(field, name).not.toBe("");
      const id = field.match(/id="([^"]+)"/)?.[1];
      expect(id, name).toBeTruthy();
      expect(html, name).toContain(`for="${id}"`);
    }
  });

  it("marks the fields that cannot be empty as required, with sensible limits", () => {
    const html = render();
    for (const name of ["ign", "uid", "primaryPosition", "whatsapp", "shareContact"]) expect(input(html, name), name).toContain("required");
    for (const name of ["secondaryPosition", "willingCaptain"]) expect(input(html, name), name).not.toContain("required");
    expect(input(html, "ign")).toMatch(/minLength="2"/);
    expect(input(html, "ign")).toMatch(/maxLength="40"/);
    expect(input(html, "uid")).toMatch(/maxLength="40"/);
  });

  it("sends the event and the page language along, and nothing that names the player", () => {
    const html = render();
    expect(input(html, "eventId")).toContain('value="event-1"');
    expect(input(html, "locale")).toContain('value="id"');
    expect(html).not.toMatch(/name="userId"/);
  });

  it("lists the game's positions, showing the everyday word for the keeper but sending the game's name", () => {
    const html = render();
    expect(html).toMatch(/<option value="Goalkeeper">Kiper<\/option>/);
    expect(html).toMatch(/<option value="Forward">Forward<\/option>/);
    expect(html).toContain("Pilih posisi");
  });

  it("makes the main position start empty, so nobody is signed up for a position by accident", () => {
    expect(render()).toMatch(/<option value="" selected="">Pilih posisi<\/option>|<option value="">Pilih posisi<\/option>/);
  });

  it("lets a player pick no backup position, and explains the required position as a fill-in", () => {
    const html = render();
    expect(html).toMatch(/<option value="">Tidak ada<\/option>|<option value="" selected="">Tidak ada<\/option>/);
    expect(html).toContain("Pilih Kiper kalau kamu mau jadi pengganti Kiper yang kurang.");
  });

  it("states the fee and when it is paid, or that the event is free", () => {
    expect(render()).toContain("Biaya Rp25.000. Bayar setelah kamu dapat slot.");
    expect(render({ feeLabel: null })).toContain("Gratis.");
  });

  it("fills in what the player gave before", () => {
    const html = render({ defaults: { whatsapp: "6281234567890" } });
    expect(input(html, "whatsapp")).toContain('value="6281234567890"');
  });

  it("keeps the WhatsApp field a telephone field", () => {
    const field = input(render(), "whatsapp");
    expect(field).toContain('type="tel"');
    expect(field).toContain('autoComplete="tel"');
  });

  it("speaks English with the game's own position name", () => {
    const html = render({ locale: "en" });
    expect(html).toContain("Main position");
    expect(html).toContain("Fee Rp25.000. You pay once you hold a slot.");
    expect(html).toMatch(/<option value="Goalkeeper">Goalkeeper<\/option>/);
    expect(input(html, "locale")).toContain('value="en"');
  });

  it("follows another game's required position", () => {
    const html = render({ positions: ["Guard", "Forward", "Center"], requiredPosition: "Center" });
    expect(html).toContain("Pilih Center kalau kamu mau jadi pengganti Center yang kurang.");
    expect(html).not.toContain("Kiper");
  });
});
