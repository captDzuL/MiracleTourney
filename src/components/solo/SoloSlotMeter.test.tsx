import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoloSlotMeter } from "./SoloSlotMeter";

Object.assign(globalThis, { React });

const snapshot = {
  required: { quota: 8, held: 5, queued: 0 },
  open: { quota: 32, held: 32, queued: 4 },
};

const render = (props: Partial<React.ComponentProps<typeof SoloSlotMeter>> = {}) =>
  renderToStaticMarkup(<SoloSlotMeter locale="id" requiredPosition="Goalkeeper" slots={snapshot} {...props} />);

describe("SoloSlotMeter", () => {
  it("shows each group with its filled and total slots, using the everyday word for the keeper", () => {
    const html = render();
    expect(html).toContain("Kiper");
    expect(html).toContain("5 dari 8 terisi");
    expect(html).toContain("Pemain lapangan");
    expect(html).toContain("32 dari 32 terisi");
  });

  it("says plainly when a group is full and how many wait in the queue", () => {
    const html = render();
    expect(html).toContain("Penuh");
    expect(html).toContain("4 di antrean");
  });

  it("does not talk about a queue when nobody is in it", () => {
    const html = render({ slots: { ...snapshot, open: { quota: 32, held: 10, queued: 0 } } });
    expect(html).not.toContain("antrean");
    expect(html).not.toContain("Penuh");
  });

  it("exposes each group as a progress bar with its numbers", () => {
    const html = render();
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain('aria-valuemax="8"');
    expect(html).toContain('aria-valuenow="32"');
    expect(html).toMatch(/aria-label="Kiper: 5 dari 8 terisi"/);
  });

  it("never draws past the end of the bar when more are held than the quota", () => {
    const html = render({ slots: { required: { quota: 8, held: 11, queued: 0 }, open: { quota: 32, held: 0, queued: 0 } } });
    const widths = [...html.matchAll(/width:(\d+)%/g)].map((match) => Number(match[1]));
    expect(widths).toEqual([100, 0]);
  });

  it("speaks English with the game's own position name", () => {
    const html = render({ locale: "en" });
    expect(html).toContain("Goalkeeper");
    expect(html).toContain("5 of 8 filled");
    expect(html).toContain("Field players");
    expect(html).toContain("4 in the queue");
    expect(html).toContain("Full");
  });

  it("follows another game's required position", () => {
    const html = render({ requiredPosition: "Center", locale: "id" });
    expect(html).toContain("Center");
    expect(html).not.toContain("Kiper");
  });

  it("shows a calm note instead of numbers when the counts are not available", () => {
    const html = render({ slots: null });
    expect(html).toContain("Jumlah slot belum bisa ditampilkan");
    expect(html).not.toContain("progressbar");
  });

  it("explains that a full group still takes sign-ups", () => {
    expect(render()).toContain("Kalau penuh, kamu masuk antrean");
    expect(render({ locale: "en" })).toContain("If it is full, you join the queue");
  });
});
