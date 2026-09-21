import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ user: vi.fn(), owner: vi.fn(), context: vi.fn(), save: vi.fn(), approve: vi.fn(), reject: vi.fn(), path: vi.fn(), tag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAnyRole: boundary.user }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.path, revalidateTag: boundary.tag }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/platform/repository", () => ({ assertUserCanManageEvent: boundary.owner, getPlayerStatFormContext: boundary.context, adminWriteMatchPlayerStats: boundary.save, approveStatSubmission: boundary.approve, rejectStatSubmission: boundary.reject }));
import * as actions from "./player-stats-v3-actions";
function form() {
  const data = new FormData();
  Object.entries({locale:"id",eventId:"event-1",matchId:"match-1",teamId:"team-1",expectedVersion:"7",expectedResultVersion:"2",operationId:"operation-1",submissionId:"sub-1",submittedAt:"2026-09-16T00:00:00.000Z",score_player1_1:"7.6",stat_player1_goal:"3",stat_player1_assist:"4",stat_player1_passing:"28",stat_player1_defense:"12"}).forEach(([key,value])=>data.set(key,value));
  return data;
}
describe("event-local player statistics actions", () => {
  beforeEach(()=>{vi.resetAllMocks();boundary.user.mockResolvedValue({id:"owner-1",role:"organizer"});boundary.context.mockResolvedValue({match:{id:"match-1",eventId:"event-1",homeTeamId:"team-1",awayTeamId:"team-2"},allowedStatKeys:["goal","assist","passing","defense"],scoreGameNumbers:[1]});});
  it("parses canonical fields and preserves event/result/idempotency guards",async()=>{
    expect(await actions.saveEventPlayerStatsAction(form())).toEqual({status:"saved"});
    expect(boundary.save).toHaveBeenCalledWith(expect.objectContaining({adminId:"owner-1",stats:{player1:{scores:[7.6],goal:3,assist:4,passing:28,defense:12}},guard:expect.objectContaining({eventId:"event-1",matchId:"match-1",expectedVersion:7,expectedResultVersion:2,operationId:"operation-1"})}));
    expect(boundary.path).toHaveBeenCalledWith("/id/organizer/events/event-1/matches/match-1");
  });
  it.each(["expectedVersion","expectedResultVersion","operationId","eventId"])("requires %s before mutation",async key=>{
    const data=form();data.delete(key);expect(await actions.saveEventPlayerStatsAction(data)).toEqual({status:"invalid"});
    expect(boundary.save).not.toHaveBeenCalled();
  });
  it("does not allow foreign team input",async()=>{const data=form();data.set("teamId","foreign");expect(await actions.saveEventPlayerStatsAction(data)).toEqual({status:"invalid"});expect(boundary.save).not.toHaveBeenCalled();});
  it("denies a manipulated match ID before loading nested match data or saving",async()=>{
    const data=form();data.set("matchId","match-b");
    boundary.owner.mockRejectedValueOnce(new Error("Not authorized"));
    expect(await actions.saveEventPlayerStatsAction(data)).toEqual({status:"unauthorized"});
    expect(boundary.context).not.toHaveBeenCalled();
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.path).not.toHaveBeenCalled();
  });
  it("rejects noncanonical defense aliases with the same parser as captain",async()=>{const data=form();data.set("stat_player1_blocks","1");expect(await actions.saveEventPlayerStatsAction(data)).toEqual({status:"invalid"});expect(boundary.save).not.toHaveBeenCalled();});
  it.each([
    ["matchId", "../secrets"],
    ["teamId", "team' OR 1=1--"],
    ["submissionId", "../../admin"],
  ] as const)("rejects unsafe nested %s before any repository call", async (field, value) => {
    const data = form();
    data.set(field, value);
    const result = field === "submissionId"
      ? await actions.approveEventPlayerStatsAction(data)
      : await actions.saveEventPlayerStatsAction(data);
    expect(result).toEqual({ status: "invalid" });
    expect(boundary.context).not.toHaveBeenCalled();
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.approve).not.toHaveBeenCalled();
    expect(boundary.reject).not.toHaveBeenCalled();
  });
  it("retains guarded submission identity during approval",async()=>{
    expect(await actions.approveEventPlayerStatsAction(form())).toEqual({status:"saved"});
    expect(boundary.approve).toHaveBeenCalledWith("sub-1","owner-1",expect.objectContaining({eventId:"event-1",matchId:"match-1",submittedAt:"2026-09-16T00:00:00.000Z"}));
  });
  it("returns a generic denial for a manipulated submission ID without refreshing or approving",async()=>{
    const data=form();data.set("submissionId","submission-b");
    boundary.approve.mockRejectedValueOnce(new Error("Not authorized"));
    expect(await actions.approveEventPlayerStatsAction(data)).toEqual({status:"unauthorized"});
    expect(boundary.approve).toHaveBeenCalledWith("submission-b","owner-1",expect.objectContaining({eventId:"event-1",matchId:"match-1"}));
    expect(boundary.path).not.toHaveBeenCalled();
  });
  it("requires a rejection note",async()=>{expect(await actions.rejectEventPlayerStatsAction(form())).toEqual({status:"invalid"});expect(boundary.reject).not.toHaveBeenCalled();});
  it("maps competing reviewer and serialization failures to conflict and refreshes canonical route",async()=>{boundary.approve.mockRejectedValue({code:"P2034"});expect(await actions.approveEventPlayerStatsAction(form())).toEqual({status:"conflict"});expect(boundary.path).toHaveBeenCalledWith("/id/organizer/events/event-1/matches/match-1");});
  it("reports uncertain save failure without retrying a mutation",async()=>{boundary.save.mockRejectedValue(new Error("transport"));expect(await actions.saveEventPlayerStatsAction(form())).toEqual({status:"failed"});expect(boundary.save).toHaveBeenCalledTimes(1);});
  it("rejects missing session and owner mismatch",async()=>{boundary.user.mockResolvedValue(null);expect(await actions.saveEventPlayerStatsAction(form())).toEqual({status:"unauthorized"});boundary.user.mockResolvedValue({id:"other",role:"organizer"});boundary.owner.mockRejectedValue(new Error("Not authorized"));expect(await actions.saveEventPlayerStatsAction(form())).toEqual({status:"unauthorized"});expect(boundary.save).not.toHaveBeenCalled();});
});
