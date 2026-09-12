import { expect, it, vi } from "vitest";
const workspace = vi.hoisted(() => vi.fn(async (input) => input));
vi.mock("../../../../../admin/admin-workspace", () => ({ default: workspace }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
import LegacyMatchDay from "./page";
it("keeps localized feedback and selects the event from the owned route, not query input", async () => {
  await LegacyMatchDay({ params: Promise.resolve({ locale: "id", eventId: "owned" }), searchParams: Promise.resolve({ matchId: "m1", success: "round-config-saved", error: "Rejected", matchEventId: "other", returnTo: "https://evil.example" }) });
  expect(await workspace.mock.calls[0][0].searchParams).toEqual({ phase: "run", activeEventId: "owned", matchEventId: "owned", matchId: "m1", success: "round-config-saved", error: "Rejected" });
});
