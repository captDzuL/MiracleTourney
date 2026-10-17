import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoloPendingTeamsNote } from "./SoloPendingTeamsNote";

Object.assign(globalThis, { React });

describe("SoloPendingTeamsNote", () => {
  it("says the teams do not exist yet and when they will", () => {
    const html = renderToStaticMarkup(<SoloPendingTeamsNote locale="id" totals={{ quota: 40, held: 35, queued: 6 }} />);
    expect(html).toContain("Tim belum dibentuk");
    expect(html).toContain("setelah pendaftaran ditutup");
    expect(html).toContain("35 dari 40 slot pemain terisi");
  });

  it("mentions the queue only when somebody is in it", () => {
    expect(renderToStaticMarkup(<SoloPendingTeamsNote locale="id" totals={{ quota: 40, held: 35, queued: 6 }} />)).toContain("6 di antrean");
    expect(renderToStaticMarkup(<SoloPendingTeamsNote locale="id" totals={{ quota: 40, held: 35, queued: 0 }} />)).not.toContain("antrean");
  });

  it("leaves out the numbers when they are not known", () => {
    const html = renderToStaticMarkup(<SoloPendingTeamsNote locale="id" totals={null} />);
    expect(html).toContain("Tim belum dibentuk");
    expect(html).not.toContain("slot pemain terisi");
  });

  it("speaks English", () => {
    const html = renderToStaticMarkup(<SoloPendingTeamsNote locale="en" totals={{ quota: 40, held: 35, queued: 6 }} />);
    expect(html).toContain("Teams are not formed yet");
    expect(html).toContain("35 of 40 player slots filled");
    expect(html).toContain("6 in the queue");
  });
});
