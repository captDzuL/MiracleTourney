import { request, type FullConfig } from "@playwright/test";

export default async function globalSetup(config?: FullConfig) {
  if (process.env.E2E_DATABASE_RESET_ALLOWED !== "true") {
    throw new Error("Blocked: set E2E_DATABASE_RESET_ALLOWED=true in .env.test before running DB-backed E2E tests.");
  }
  const baseURL = config?.projects[0]?.use.baseURL;
  if (!baseURL) return;
  // Compile route modules before a story's timer starts. This context has no
  // fixture, login or browser storage; every request is read-only and discarded.
  const context = await request.newContext({ baseURL });
  try {
    for (const path of [
      "/en/login", "/en/organizer", "/en/events/__e2e_prewarm__",
      "/en/organizer/events/__e2e_prewarm__/competition",
      "/en/organizer/events/__e2e_prewarm__/schedule",
      "/en/organizer/events/__e2e_prewarm__/matches/__e2e_prewarm__",
      "/en/organizer/events/__e2e_prewarm__/legacy-match-day",
      "/api/organizer/events/__e2e_prewarm__/competition",
      "/api/events/__e2e_prewarm__/ongoing",
      "/id",
      "/id/events/flashpeak-champions-32/participants",
      "/id/events/flashpeak-champions-32/schedule",
      "/id/events/flashpeak-champions-32/bracket",
      "/id/events/flashpeak-champions-32/leaderboards",
      "/en/admin?phase=prepare",
      "/en/admin?phase=import&activeEventId=__e2e_prewarm__",
      "/id/admin?phase=run&activeEventId=__e2e_prewarm__&matchEventId=__e2e_prewarm__",
      "/id/events/__e2e_prewarm__/bracket",
      "/id/organizer/events/__e2e_prewarm__/registration?view=import",
      "/en/organizer/events/__e2e_prewarm__/registration?view=import",
      "/id/events/__e2e_prewarm__",
    ]) {
      const response = await context.get(path, { maxRedirects: 0 });
      await response.body();
      if (![200, 301, 302, 303, 307, 308, 401, 403, 404].includes(response.status())) {
        throw new Error(`E2E route prewarm failed (${response.status()}): ${path}`);
      }
    }
  } finally { await context.dispose(); }
}
