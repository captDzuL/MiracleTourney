// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import id from "../../../../../messages/id.json";
import { CompetitionWorkspace } from "../../competition/CompetitionWorkspace";
import { generateCompetitionGraph } from "@/lib/tournament/competition";
import { TOURNAMENT_FORMAT_PRESETS } from "@/lib/tournament/formats/types";
import type { CompetitionWorkspaceState } from "@/lib/competition/workspace-types";
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const boundary = vi.hoisted(() => ({ execute: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/actions/competition-v3-actions", () => ({ mutateCompetitionWorkspaceAction: boundary.execute, previewCompetitionResultCorrectionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }) }));
function fixture(preset: keyof typeof TOURNAMENT_FORMAT_PRESETS = "groupPlayoffs"): CompetitionWorkspaceState {
  const teams = Array.from({length:16},(_,i)=>({id:`team-${i}`,name:`Team ${i}`,seed:i+1}));
  const graph = generateCompetitionGraph({eventId:"event",config:TOURNAMENT_FORMAT_PRESETS[preset],teams});
  return {event:{id:"event",name:"Cup",status:"Ongoing",version:4,timezone:"Asia/Jakarta",startsAt:null,publishedScheduleVersion:3,config:graph.config},graph,teams,drawing:{status:"published",teams},matches:graph.matches.map((m,i)=>({id:m.id,homeTeamId:"team-0",awayTeamId:"team-1",homeScore:0,awayScore:0,status:i===0?"Live":"Scheduled",scheduleStatus:i===0?"live":"confirmed",resultVersion:0,bestOf:m.bestOf,roundLabel:`Round ${m.round}`,phaseId:m.phaseId,groupId:m.groupId,start:"2026-09-12T02:00:00Z",end:"2026-09-12T02:30:00Z",room:"Room A",games:[]})),standings:[{phaseId:graph.phases[0].id,groupId:graph.groups[0]?.id??null,complete:false,rows:[]}],readiness:[],actions:[],schedule:null,publishedSchedule:null,incidents:[],announcements:[],audit:[],unavailableSections:[]};
}
describe("master competition operations",()=>{
  let host:HTMLDivElement, root:Root, state:CompetitionWorkspaceState;
  beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);state=fixture();boundary.execute.mockReset();vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>({ok:true,json:async()=>state})));});
  afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
  function render(view:"competition"|"schedule"|"match-control"="match-control",query:Record<string,string>={},locale:"en"|"id"="en") {act(()=>root.render(<NextIntlClientProvider locale={locale} messages={locale==="id"?id:en}><CompetitionWorkspace initialState={state} locale={locale} view={view} masterShell query={query}/></NextIntlClientProvider>));}
  it("shows an operational queue and a URL-selected match instead of repeated report sections",()=>{
    const selected=state.matches[2];render("match-control",{match:selected.id});
    expect(host.querySelector('[aria-label="Selected match"]')?.textContent).toContain("Team 0");
    const detail=host.querySelector<HTMLAnchorElement>('[data-match-detail]');
    expect(detail?.getAttribute("href")).toBe(`/en/organizer/events/event/matches/${encodeURIComponent(selected.id)}?view=result`);
    expect(host.querySelector('[aria-label="Match queue"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Audit history");
    expect(host.querySelector('form[aria-label="Official result"]')).toBeNull();
  });
  it("filters needs-result without treating future unplayed fixtures as missing results",()=>{
    state.matches[1].status="Completed";render("match-control",{filter:"needs-result"});
    expect(host.querySelectorAll('[data-match-row]')).toHaveLength(2);
    state.matches[0].resultVersion=1;render("match-control",{filter:"needs-result"});
    expect(host.querySelectorAll('[data-match-row]')).toHaveLength(1);
  });
  it("combines group, graph round and event-local day filters",()=>{
    const m=state.matches[0];const round=state.graph!.matches[0].round;
    state.matches[1].start="2026-09-13T02:00:00Z";
    render("match-control",{group:m.groupId!,round:String(round),matchday:"2026-09-12"});
    const rows=[...host.querySelectorAll<HTMLElement>('[data-match-row]')];
    expect(rows.length).toBeGreaterThan(0);expect(rows.every(row=>state.matches.find(m=>m.id===row.dataset.matchRow)?.groupId===m.groupId)).toBe(true);
    expect(rows.some(row=>row.dataset.matchRow===state.matches[1].id)).toBe(false);
  });
  it("bounds the queue and retains filters in pagination and selection links",()=>{
    state=fixture("roundRobin");render("match-control",{filter:"next",page:"2"});
    expect(host.querySelectorAll('[data-match-row]')).toHaveLength(12);
    expect(host.querySelector<HTMLAnchorElement>('[data-previous]')?.search).toContain("filter=next");
    expect(host.querySelector<HTMLAnchorElement>('[data-match-row]')?.search).toContain("page=2");
  });
  it("renders action badges and incident filters from the current snapshot",()=>{
    state.actions=[{id:"action",matchId:state.matches[0].id,priority:"critical",title:"Missing readiness",detail:null}];
    state.incidents=[{id:"incident",matchId:state.matches[1].id,kind:"network",description:"Disconnected",resolvedAt:null}];
    render("match-control",{filter:"incidents"});
    expect(host.querySelector('[data-action-count]')?.textContent).toContain("1");
    expect(host.querySelectorAll('[data-match-row]')).toHaveLength(1);
  });
  it.each(["Draft","Published","Finished"])("locks operational readiness at authoritative lifecycle %s",status=>{
    state.event.status=status;render("match-control",{match:state.matches[1].id});
    const ready=[...host.querySelectorAll<HTMLButtonElement>('button[data-readiness]')];
    expect(ready).toHaveLength(2);expect(ready.every(button=>button.disabled)).toBe(true);
  });
  it("sends readiness to the existing versioned action boundary and surfaces conflicts",async()=>{
    boundary.execute.mockResolvedValue({status:"conflict"});render("match-control",{match:state.matches[1].id});
    await act(async()=>host.querySelector<HTMLButtonElement>('button[data-readiness]')!.click());
    expect(boundary.execute).toHaveBeenCalledWith(expect.objectContaining({eventId:"event",expectedVersion:4,command:{kind:"readiness_update",matchId:state.matches[1].id,teamId:"team-0",status:"ready"}}));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("changed");
  });
  it.each([["singleElimination","Elimination bracket"],["doubleElimination","Upper & lower bracket"],["roundRobin","League standings"],["groupPlayoffs","Qualification cutline"]] as const)("uses authoritative format context for %s",(preset,label)=>{
    state=fixture(preset);render("competition");expect(host.textContent).toContain(label);
    expect(host.querySelector('[aria-label="Match queue"]')).toBeNull();
    if(preset==="roundRobin") expect(host.textContent).not.toMatch(/Grand Final/i);
  });
  it("shows only schedule controls and fixtures on schedule, preserving publication state",()=>{
    render("schedule",{group:state.matches[0].groupId!});
    expect(host.querySelector('form[aria-label="Schedule generation"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Fixture schedule"]')).not.toBeNull();
    expect(host.textContent).toContain("Published version 3");
    expect(host.textContent).not.toContain("Audit history");
  });
  it("does not expose drawing controls before registration closes or after finish",()=>{
    state.event.status="Published";state.drawing=null;render("competition");
    expect(host.textContent).toContain("Close registration");
    expect([...host.querySelectorAll('button')].some(b=>b.textContent?.includes("Save drawing"))).toBe(false);
    state.event.status="Finished";render("competition");expect(host.textContent).toContain("Competition finished");
  });
  it("localizes Indonesian queue labels and generated round labels",()=>{
    render("match-control",{},"id");expect(host.textContent).toContain("Kontrol Pertandingan");
    expect(host.textContent).toContain("Antrean pertandingan");
    expect(host.textContent).not.toMatch(/Selected match|Readiness|Round 1|Needs result|Group A|Missing readiness/);
    expect(host.querySelector<HTMLAnchorElement>('[data-match-detail]')?.pathname).toMatch(/^\/id\/organizer\//);
  });
  it("allows published legacy phases and refuses a stale published assignment when starting",()=>{
    const match=state.matches[1];
    state.drawing=null;state.drawingPublished=true;
    state.readiness=[{matchId:match.id,teamId:"team-0",status:"ready",note:null},{matchId:match.id,teamId:"team-1",status:"ready",note:null}];
    state.publishedSchedule={id:"pub",version:3,baseMatches:[],draft:{kind:"draft",timezone:"Asia/Jakarta",feasible:true,assignments:[{matchId:match.id,roomId:match.room!,start:match.start!,end:match.end!}],conflicts:[],warnings:[],affectedMatchIds:[],recalculatedMatchIds:[],impact:[]}};
    match.scheduleVersion=3;render("match-control",{match:match.id});
    const start=()=>[...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Start match")!;
    expect(start().disabled).toBe(false);
    match.scheduleVersion=2;render("match-control",{match:match.id});expect(start().disabled).toBe(true);
  });
  it("does not silently replace a missing selected match with another match",()=>{
    render("match-control",{match:"foreign"});
    expect(host.querySelector("[data-match-detail]")).toBeNull();
    expect(host.textContent).toContain("selected match is unavailable");
  });
  it("shows localized actionable reasons and incident details in the selected context",()=>{
    state.actions=[{id:"action",matchId:state.matches[1].id,priority:"critical",title:"Team readiness deadline missed",detail:"Organizer review required"}];
    state.incidents=[{id:"incident",matchId:state.matches[1].id,kind:"network",description:"Room A disconnected",resolvedAt:null}];
    render("match-control",{match:state.matches[1].id},"id");
    expect(host.textContent).toContain("Tenggat kesiapan tim terlewat");
    expect(host.querySelector('[aria-label="Pertandingan terpilih"]')?.textContent).toContain("Room A disconnected");
    expect(host.textContent).not.toContain("Organizer review required");
  });
  it("filters schedule override controls while retaining hidden reviewed assignments",()=>{
    render("schedule",{group:state.matches[0].groupId!});
    const visibleIds=state.matches.filter(match=>match.groupId===state.matches[0].groupId&&match.status!=="Bye").map(match=>match.id);
    const overrideIds=[...host.querySelectorAll<HTMLInputElement>('input[name^="override-"]')].map(input=>input.name.slice(9));
    expect(overrideIds).toEqual(visibleIds);
  });
  it("keeps draft schedule publication disabled until drawing is published and translates diagnostics",()=>{
    state.drawing={...state.drawing!,status:"draft"};
    state.schedule={id:"draft",version:4,baseMatches:[],draft:{kind:"draft",timezone:"Asia/Jakarta",feasible:true,assignments:[],conflicts:[],warnings:[{code:"TBD_PARTICIPANTS",matchIds:[state.matches[0].id],message:"Potential participants reserve rest conservatively until results are resolved."}],affectedMatchIds:[],recalculatedMatchIds:[],impact:[]}};
    render("schedule",{},"id");
    const publish=[...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Terbitkan jadwal")!;
    expect(publish.disabled).toBe(true);
    expect(host.textContent).not.toContain("Potential participants");
    expect(host.textContent).toContain("Peserta belum ditentukan");
  });
  it("keeps an active legacy drawing locked even without a saved drawing-order record",()=>{
    state.event.status="Registration Closed";state.drawing=null;state.drawingPublished=true;
    state.matches=state.matches.map(match=>({...match,status:"Scheduled",scheduleStatus:"confirmed"}));
    render("competition");
    expect([...host.querySelectorAll("button")].some(button=>button.textContent==="Save drawing draft")).toBe(false);
    expect(host.textContent).toContain("Published drawing is locked");
  });
  it.each([
    ["groupPlayoffs", "id", "Klasemen memerlukan keputusan pemecah seri", "Peringkat yang belum ditentukan tidak dapat lolos secara otomatis."],
    ["groupPlayoffs", "en", "Standings require a tiebreak decision", "Unresolved ranks cannot qualify automatically"],
    ["roundRobin", "id", "Klasemen memerlukan keputusan pemecah seri", "Peringkat yang belum ditentukan tidak dapat lolos secara otomatis."],
    ["roundRobin", "en", "Standings require a tiebreak decision", "Unresolved ranks cannot qualify automatically"],
  ] as const)("links the event-level %s tiebreak action to standings in %s", (preset, locale, reason, detail) => {
    state = fixture(preset);
    // Exact event-scoped action produced by applyResult when complete standings remain tied.
    state.actions = [{ id: "tiebreak-action", matchId: null, priority: "critical", title: "Standings require a tiebreak decision", detail: "Unresolved ranks cannot qualify automatically" }];
    render("match-control", { filter: "live", match: state.matches[0].id, page: "2" }, locale);
    const action = [...host.querySelectorAll<HTMLAnchorElement>("a")].find(link => link.textContent?.includes(reason));
    expect(action).toBeDefined();
    expect(action!.textContent).toContain(detail);
    expect(action!.getAttribute("href")).toBe(`/${locale}/organizer/events/event/competition#competition-standings`);
    expect(action!.search).toBe("");
    expect(action!.pathname).not.toContain("match-control");
    if (locale === "id") expect(action!.textContent).not.toMatch(/Standings require|Unresolved ranks/);
    render("competition", {}, locale);
    expect(host.querySelector("#competition-standings")?.textContent).toMatch(locale === "id" ? /Klasemen/ : /standings/i);
  });
});
