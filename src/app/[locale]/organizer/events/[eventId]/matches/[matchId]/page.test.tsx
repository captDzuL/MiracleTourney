// @vitest-environment jsdom
import React from "react";
import {describe,it,expect,vi,beforeEach} from "vitest";
const boundary=vi.hoisted(()=>({flag:vi.fn(),read:vi.fn(),stats:vi.fn(),user:vi.fn(),legacy:vi.fn()}));
vi.mock("@/lib/feature-flags",()=>({isFeatureEnabled:boundary.flag}));
vi.mock("@/lib/competition/workspace-read",()=>({readCompetitionWorkspace:boundary.read}));
vi.mock("@/lib/platform/repository",()=>({readEventMatchStatistics:boundary.stats}));
vi.mock("@/lib/auth/session",()=>({requireAnyRole:boundary.user}));
vi.mock("@/lib/competition/workspace-page",()=>({workspacePage:boundary.legacy}));
vi.mock("@/i18n/redirect",()=>({redirectToActiveLocale:(path:string)=>{throw new Error("redirect:"+path);}}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not-found");}}));
vi.mock("@/components/v3/organizer/matches/MatchResultStatisticsWorkspace",()=>({MatchResultStatisticsWorkspace:()=>null}));
import MatchPage from "./page";
describe("canonical match detail composition",()=>{
 const params=Promise.resolve({locale:"id",eventId:"event",matchId:"match%3A1"});
 beforeEach(()=>{vi.resetAllMocks();boundary.flag.mockReturnValue(true);boundary.user.mockResolvedValue({id:"owner",role:"organizer"});boundary.read.mockResolvedValue({matches:[{id:"match:1"}]});boundary.stats.mockResolvedValue({eventId:"event",matchId:"match:1"});});
 it("forwards canonical decoded match identity and URL view to the shared workspace",async()=>{
   const result=await MatchPage({params,searchParams:Promise.resolve({view:"statistics"})}) as React.ReactElement<Record<string,unknown>>;
   expect(result?.props).toMatchObject({locale:"id",matchId:"match:1",view:"statistics"});
   expect(boundary.stats).toHaveBeenCalledWith("event","match:1","owner");
   expect(boundary.legacy).not.toHaveBeenCalled();
 });
 it("keeps existing rollback composition without loading stats",async()=>{
   boundary.flag.mockImplementation((flag:string)=>flag!=="organizer_master_shell_v3");
   await MatchPage({params});expect(boundary.legacy).toHaveBeenCalled();expect(boundary.stats).not.toHaveBeenCalled();
 });
 it("rejects foreign match before reading roster or submissions",async()=>{
   await expect(MatchPage({params:Promise.resolve({locale:"en",eventId:"event",matchId:"foreign"})})).rejects.toThrow("not-found");
   expect(boundary.stats).not.toHaveBeenCalled();
 });
});
