// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {NextIntlClientProvider} from "next-intl";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import en from "../../../../../messages/en.json";
import id from "../../../../../messages/id.json";
import {MatchResultStatisticsWorkspace} from "./MatchResultStatisticsWorkspace";
import type {CompetitionWorkspaceState} from "@/lib/competition/workspace-types";
import type {EventMatchStatistics} from "@/lib/platform/repository";
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
const boundary=vi.hoisted(()=>({save:vi.fn(),approve:vi.fn(),reject:vi.fn(),operation:vi.fn(),preview:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/actions/player-stats-v3-actions",()=>({saveEventPlayerStatsAction:boundary.save,approveEventPlayerStatsAction:boundary.approve,rejectEventPlayerStatsAction:boundary.reject}));
vi.mock("@/lib/actions/competition-v3-actions",()=>({mutateCompetitionWorkspaceAction:boundary.operation,previewCompetitionResultCorrectionAction:boundary.preview}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:boundary.refresh})}));
function fixture():CompetitionWorkspaceState{return {event:{id:"event",name:"Cup",version:7,timezone:"Asia/Jakarta",startsAt:null,publishedScheduleVersion:null,config:null},teams:[{id:"home",name:"Garuda"},{id:"away",name:"Vortex"}],matches:[{id:"match:1",homeTeamId:"home",awayTeamId:"away",homeScore:2,awayScore:0,status:"Completed",scheduleStatus:"completed",resultVersion:2,bestOf:3,roundLabel:"Final",phaseId:null,groupId:null,start:null,end:null,room:null,games:[{gameNumber:1,homeScore:3,awayScore:0},{gameNumber:2,homeScore:2,awayScore:1}]}],graph:null,drawing:null,standings:[],readiness:[],actions:[],schedule:null,publishedSchedule:null,incidents:[],announcements:[],audit:[],unavailableSections:[]};}
function statistics():EventMatchStatistics{return {eventId:"event",matchId:"match:1",eventVersion:7,resultVersion:2,games:[{gameNumber:2,homeScore:2,awayScore:1},{gameNumber:1,homeScore:3,awayScore:0}],allowedStatKeys:["goal","assist","passing","defense"],scoreGameNumbers:[1,2],scoreContextUnavailable:false,teams:[{id:"home",name:"Garuda",players:[{id:"player1",teamId:"home",nickname:"Nyx",position:"Forward"}]},{id:"away",name:"Vortex",players:[]}],stats:{player1:{scores:[7.6,null],goals:3,assists:4,passing:28,defense:12}},submissions:[{id:"sub",teamId:"home",status:"pending",stats:{player1:{scores:[8.1,null],goal:1,assist:2,passing:3,defense:4}},submittedAt:"2026-09-16T00:00:00.000Z",reviewedAt:null,reviewedBy:null,rejectionNote:null}],revisions:[{id:"rev",version:2,homeScore:2,awayScore:0,reason:"Verified score sheet",actorUserId:"owner",createdAt:"2026-09-16T00:00:00.000Z"}]};}
describe("combined match result and statistics workspace",()=>{
 let host:HTMLDivElement,root:Root,state:CompetitionWorkspaceState,data:EventMatchStatistics;
 beforeEach(()=>{vi.resetAllMocks();state=fixture();data=statistics();host=document.createElement("div");document.body.append(host);root=createRoot(host);vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>({ok:true,json:async()=>state})));boundary.save.mockResolvedValue({status:"saved"});boundary.approve.mockResolvedValue({status:"saved"});});
 afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
 function render(view="result",locale:"id"|"en"="en"){act(()=>root.render(<NextIntlClientProvider locale={locale} messages={locale==="id"?id:en}><MatchResultStatisticsWorkspace initialState={state} statistics={data} matchId="match:1" locale={locale} view={view}/></NextIntlClientProvider>));}
 const click=async(text:string)=>{const button=[...host.querySelectorAll("button")].find(b=>b.textContent===text)!;expect(button).toBeDefined();await act(async()=>button.click());};
 it.each(["id","en"] as const)("retains locale and match scope in URL views (%s)",locale=>{
  render("statistics",locale);
  const links=[...host.querySelectorAll<HTMLAnchorElement>("[data-match-view]")];
  expect(links.map(a=>a.getAttribute("href"))).toEqual(["result","statistics","history"].map(view=>`/${locale}/organizer/events/event/matches/match%3A1?view=${view}`));
  expect(links[1].getAttribute("aria-current")).toBe("page");
  expect(host.querySelector('form[aria-label="Official result"]')).toBeNull();
 });
 it("keeps official score visible and supports cancel without mutation",async()=>{
  render();expect(host.querySelector("[data-official-score]")?.textContent).toContain("2 : 0");
  await click("Reopen for correction");
  expect(host.querySelectorAll('input[name^="home-"]')).toHaveLength(2);
  expect(host.querySelector<HTMLInputElement>('input[name="home-1"]')?.value).toBe("3");
  await click("Cancel correction");
  expect(boundary.operation).not.toHaveBeenCalled();expect(host.querySelector("[data-official-score]")?.textContent).toContain("2 : 0");
 });
 it("retains readiness deadline, checked-in and override-start operations for unfinished matches",async()=>{
  state.event.status="Ongoing";state.matches[0]={...state.matches[0],status:"Scheduled",resultVersion:0,games:[]};data.resultVersion=0;data.games=[];
  render();boundary.operation.mockResolvedValue({status:"saved",receipt:{version:7}});
  await click("Check readiness deadline");
  expect(boundary.operation).toHaveBeenLastCalledWith(expect.objectContaining({command:{kind:"readiness_deadline",matchId:"match:1"}}));
  await click("Garuda: checked in");
  expect(boundary.operation).toHaveBeenLastCalledWith(expect.objectContaining({command:{kind:"readiness_update",matchId:"match:1",teamId:"home",status:"checked_in"}}));
  const start=host.querySelector<HTMLFormElement>('form[aria-label="Start match"]')!;
  start.querySelector<HTMLInputElement>('[name="reason"]')!.value="Both captains at desk";
  await act(async()=>start.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(boundary.operation).toHaveBeenLastCalledWith(expect.objectContaining({command:{kind:"match_start",matchId:"match:1",reason:"Both captains at desk"}}));
  expect(host.querySelector('form[aria-label="Mark delayed and preview impact"]')).not.toBeNull();
 });
 it.each([1,3,5])("submits played BO%s games through the authoritative operation",async(bestOf)=>{
  state.matches[0]={...state.matches[0],bestOf,status:"Live",resultVersion:0,games:[]};data={...data,resultVersion:0,games:[]};render();
  for(let i=1;i<bestOf;i++)await click("Add played game");
  expect(host.querySelectorAll('input[name^="home-"]')).toHaveLength(bestOf);
  boundary.operation.mockResolvedValue({status:"saved",receipt:{version:8}});
  await act(async()=>host.querySelector('form[aria-label="Official result"]')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(boundary.operation).toHaveBeenCalledWith(expect.objectContaining({expectedVersion:7,command:expect.objectContaining({kind:"result_submit",matchId:"match:1",games:expect.arrayContaining([{gameNumber:bestOf,homeScore:0,awayScore:0}])})}));
 });
 it("renders canonical fields with legacy reader fallback and submits blank scores as null",async()=>{
  render("statistics");const form=host.querySelector<HTMLFormElement>('[data-player-form="home"]')!;
  expect(form).not.toBeNull();expect(form.querySelector<HTMLInputElement>('[name="stat_player1_goal"]')!.value).toBe("3");
  expect(form.querySelector<HTMLInputElement>('[name="stat_player1_assist"]')!.value).toBe("4");
  expect(form.querySelector('[name*="blocks"]')).toBeNull();
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  const sent=boundary.save.mock.calls[0][0] as FormData;
  expect(sent.get("score_player1_2")).toBe("");expect(sent.get("expectedResultVersion")).toBe("2");
 });
 it("shows captain pending values separately and includes snapshot guards in approval",async()=>{
  render("statistics");expect(host.querySelector("[data-submission]")?.textContent).toContain("8.1");
  await click("Approve submission");
  const sent=boundary.approve.mock.calls[0][0] as FormData;
  expect(sent.get("submissionId")).toBe("sub");expect(sent.get("submittedAt")).toBe("2026-09-16T00:00:00.000Z");
 });
 it("preserves the original operation for uncertain replay and locks new writes",async()=>{
  boundary.save.mockRejectedValueOnce(new Error("lost response"));render("statistics");
  const form=host.querySelector<HTMLFormElement>("[data-player-form]")!;
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  const original=boundary.save.mock.calls[0][0];
  expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  await click("Retry same save");
  expect(boundary.save.mock.calls[1][0]).toBe(original);
 });
 it("blocks stale statistic forms and offers authoritative reload",()=>{
  state.event.version=8;render("statistics");
  expect(host.querySelector<HTMLButtonElement>('[data-player-form] button[type="submit"]')?.disabled).toBe(true);
  expect(host.textContent).toContain("Statistics changed");
 });
 it("exposes result revisions and reviewed submission history",()=>{render("history");expect(host.textContent).toContain("Verified score sheet");expect(host.querySelectorAll("[data-result-revision]")).toHaveLength(1);expect(host.querySelector("[data-player-form]")).toBeNull();});
 it("focuses an invalid score and connects a localized inline error without saving",async()=>{
  render("statistics","id");
  const form=host.querySelector<HTMLFormElement>("[data-player-form]")!,input=form.querySelector<HTMLInputElement>('[name="score_player1_1"]')!;
  input.value="10.1";
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(boundary.save).not.toHaveBeenCalled();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(input);
  const errorId=input.getAttribute("aria-describedby")!.split(" ").at(-1)!;
  expect(document.getElementById(errorId)?.textContent).toContain("Skor pemain");
 });
 it("requires a review note and focuses its field without rejecting",async()=>{
  render("statistics");const form=host.querySelector<HTMLFormElement>("[data-submission]")!;
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(boundary.reject).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(form.querySelector("textarea"));
 });
 it("previews and confirms correction through the existing result engine",async()=>{
  render();await click("Reopen for correction");
  boundary.preview.mockResolvedValue({token:"preview-1",competitionVersion:7,affectedMatchIds:[],blockedMatchIds:[],participants:[],standings:[],schedule:null});
  await click("Preview correction");
  const reason=host.querySelector<HTMLInputElement>('[name="correctionReason"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(reason,"Verified correction");reason.dispatchEvent(new Event("input",{bubbles:true}));});
  boundary.operation.mockResolvedValue({status:"saved",receipt:{version:8}});
  await act(async()=>host.querySelector('form[aria-label="Official result"]')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(boundary.operation).toHaveBeenCalledWith(expect.objectContaining({command:expect.objectContaining({kind:"result_correct",reason:"Verified correction",previewToken:"preview-1"})}));
 });
 it("disables confirmation when the official result changed while editing",async()=>{
  render();await click("Reopen for correction");
  const input=host.querySelector<HTMLInputElement>('[name="home-1"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"4");input.dispatchEvent(new Event("input",{bubbles:true}));});
  state={...state,event:{...state.event,version:8},matches:[{...state.matches[0],resultVersion:3}]};render();
  expect(host.textContent).toContain("Official result changed");
  expect([...host.querySelectorAll("button")].find(b=>b.textContent==="Confirm correction")?.disabled).toBe(true);
 });
});
