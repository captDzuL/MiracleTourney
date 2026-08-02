import { beforeEach, describe, expect, it } from "vitest";

import { getImportSnapshot } from "@/lib/platform/demo-store";

import { parseAndValidateTeamImport } from "./team-import";

function resetStore() {
  Reflect.deleteProperty(globalThis as typeof globalThis & { __mflStore?: unknown }, "__mflStore");
}

describe("parseAndValidateTeamImport", () => {
  beforeEach(() => {
    resetStore();
  });

  it("accepts the launch CSV shape and returns normalized import rows", () => {
    const result = parseAndValidateTeamImport(
      [
        "event_slug,team_name,team_tag,captain_name,captain_contact",
        "flashpeak-open-league,North Axis,na,Salsa,08189",
      ].join("\n"),
      getImportSnapshot(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected successful result");

    expect(result.rows).toEqual([
      {
        eventId: "event-flashpeak-open",
        teamName: "North Axis",
        teamTag: "NA",
        captainName: "Salsa",
        captainContact: "08189",
      },
    ]);
  });

  it("accepts utf-8 bom headers and quoted values", () => {
    const result = parseAndValidateTeamImport(
      [
        "\uFEFFevent_slug,team_name,team_tag,captain_name,captain_contact",
        'flashpeak-open-league,"North Axis, Prime",na,"Salsa Jr",08189',
      ].join("\n"),
      getImportSnapshot(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected successful result");

    expect(result.rows[0]).toMatchObject({
      eventId: "event-flashpeak-open",
      teamName: "North Axis, Prime",
      teamTag: "NA",
      captainName: "Salsa Jr",
      captainContact: "08189",
    });
  });

  it("rejects rows that point at an unknown event slug", () => {
    const result = parseAndValidateTeamImport(
      [
        "event_slug,team_name,team_tag,captain_name,captain_contact",
        "unknown-event,North Axis,NA,Salsa,08189",
      ].join("\n"),
      getImportSnapshot(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");

    expect(result.message).toContain("Row 2");
    expect(result.message).toContain("event_slug");
    expect(result.message).toContain("unknown-event");
  });

  it("rejects duplicate team tags inside the same event", () => {
    const result = parseAndValidateTeamImport(
      [
        "event_slug,team_name,team_tag,captain_name,captain_contact",
        "flashpeak-open-league,Another Miracle,MFC,Salsa,08189",
      ].join("\n"),
      getImportSnapshot(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");

    expect(result.message).toContain("Row 2");
    expect(result.message).toContain("team_tag");
    expect(result.message).toContain("MFC");
  });

  it("rejects duplicate team names inside the same event", () => {
    const result = parseAndValidateTeamImport(
      [
        "event_slug,team_name,team_tag,captain_name,captain_contact",
        "flashpeak-open-league,Miracle Five,NAX,Salsa,08189",
      ].join("\n"),
      getImportSnapshot(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");

    expect(result.message).toContain("Row 2");
    expect(result.message).toContain("team_name");
    expect(result.message).toContain("Miracle Five");
  });

  it("rejects rows that would exceed the event participant cap", () => {
    const result = parseAndValidateTeamImport(
      [
        "event_slug,team_name,team_tag,captain_name,captain_contact",
        "flashpeak-open-league,North Axis Prime,NAP,Salsa,08189",
        "flashpeak-open-league,North Axis Ultra,NAU,Salsa,08190",
        "flashpeak-open-league,North Axis Nova,NAN,Salsa,08191",
        "flashpeak-open-league,North Axis Elite,NAE,Salsa,08192",
        "flashpeak-open-league,North Axis Pulse,NPU,Salsa,08193",
        "flashpeak-open-league,North Axis Rift,NRF,Salsa,08194",
        "flashpeak-open-league,North Axis Edge,NED,Salsa,08195",
        "flashpeak-open-league,North Axis Flux,NFX,Salsa,08196",
        "flashpeak-open-league,North Axis Apex,NAX,Salsa,08197",
      ].join("\n"),
      getImportSnapshot(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed result");

    expect(result.message).toContain("Row 10");
    expect(result.message).toContain("participant cap");
    expect(result.message).toContain("flashpeak-open-league");
  });
});
