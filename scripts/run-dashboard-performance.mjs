import { chromium } from "@playwright/test";

const baseUrl = process.env.DASHBOARD_PERF_BASE_URL;
const adminEmail = process.env.DASHBOARD_ADMIN_EMAIL;
const adminPassword = process.env.DASHBOARD_ADMIN_PASSWORD;
const captainEmail = process.env.DASHBOARD_CAPTAIN_EMAIL;
const captainPassword = process.env.DASHBOARD_CAPTAIN_PASSWORD;
const organizerEmail = process.env.DASHBOARD_PERF_ORGANIZER_EMAIL ?? adminEmail;
const organizerPassword = process.env.DASHBOARD_PERF_ORGANIZER_PASSWORD ?? adminPassword;
const eventId = process.env.DASHBOARD_PERF_EVENT_ID;
const publicEventSlug = process.env.DASHBOARD_PERF_PUBLIC_EVENT_SLUG;
const thresholdMs = Number(process.env.DASHBOARD_PERF_THRESHOLD_MS ?? "3000");
const browserBudgets = { lcpMs: 2_500, inpMs: 200, cls: 0.1, ttfbMs: 800 };

const missingInputs = [
  ["DASHBOARD_PERF_BASE_URL", baseUrl],
  ["DASHBOARD_ADMIN_EMAIL", adminEmail],
  ["DASHBOARD_ADMIN_PASSWORD", adminPassword],
  ["DASHBOARD_CAPTAIN_EMAIL", captainEmail],
  ["DASHBOARD_CAPTAIN_PASSWORD", captainPassword],
  ["DASHBOARD_PERF_EVENT_ID", eventId],
  ["DASHBOARD_PERF_PUBLIC_EVENT_SLUG", publicEventSlug],
].filter(([, value]) => !value).map(([name]) => name);

if (missingInputs.length > 0) {
  console.error(`[dashboard-perf] BLOCKED: missing external inputs ${missingInputs.join(", ")}.`);
  process.exitCode = 2;
  process.exit(2);
}

async function signIn(page, email, password) {
  await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

async function measure(page, path) {
  const startedAt = performance.now();
  await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "networkidle" });
  const duration = Math.round(performance.now() - startedAt);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const eventEntries = performance.getEntriesByType("event");
    const layoutShifts = performance.getEntriesByType("layout-shift");
    const ttfb = navigation && "responseStart" in navigation && "requestStart" in navigation
      ? Number(navigation.responseStart) - Number(navigation.requestStart)
      : null;
    const lcp = lcpEntries.length ? Number(lcpEntries.at(-1)?.startTime ?? 0) : null;
    const inp = eventEntries.length ? Math.max(...eventEntries.map((entry) => Number(entry.duration) || 0)) : null;
    const cls = layoutShifts.reduce((total, entry) => {
      const shift = entry;
      return total + (shift.hadRecentInput ? 0 : Number(shift.value) || 0);
    }, 0);
    return { lcp, inp, cls, ttfb };
  });
  console.log(`${path}: ${duration}ms metrics=${JSON.stringify(metrics)}`);
  if (duration > thresholdMs) {
    throw new Error(`${path} loaded in ${duration}ms, above ${thresholdMs}ms threshold.`);
  }
  const metricFailures = [
    ["LCP", metrics.lcp, browserBudgets.lcpMs],
    ["INP", metrics.inp, browserBudgets.inpMs],
    ["CLS", metrics.cls, browserBudgets.cls],
    ["TTFB", metrics.ttfb, browserBudgets.ttfbMs],
  ].flatMap(([name, value, budget]) => value === null || value >= budget ? [`${name}=${value ?? "unavailable"} (budget < ${budget})`] : []);
  if (metricFailures.length > 0) {
    throw new Error(`${path} browser budget failed: ${metricFailures.join(", ")}`);
  }
}

const browser = await chromium.launch();
try {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, adminEmail, adminPassword);
  await measure(adminPage, "/id/admin");
  await measure(adminPage, "/id/admin?phase=import");
  await measure(adminPage, "/id/admin?phase=run");
  await measure(adminPage, "/id/admin?phase=review");
  await adminContext.close();

  const organizerContext = await browser.newContext();
  const organizerPage = await organizerContext.newPage();
  await signIn(organizerPage, organizerEmail, organizerPassword);
  for (const path of [
    `/id/organizer/events/${encodeURIComponent(eventId)}/overview`,
    `/id/organizer/events/${encodeURIComponent(eventId)}/registration`,
    `/id/organizer/events/${encodeURIComponent(eventId)}/participants`,
    `/id/organizer/events/${encodeURIComponent(eventId)}/competition`,
    `/id/organizer/events/${encodeURIComponent(eventId)}/match-control`,
    `/id/organizer/events/${encodeURIComponent(eventId)}/completion`,
    `/id/organizer/events/${encodeURIComponent(eventId)}/certificates`,
  ]) {
    await measure(organizerPage, path);
  }
  await organizerContext.close();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await measure(publicPage, `/id/events/${encodeURIComponent(publicEventSlug)}`);
  await publicContext.close();

  const captainContext = await browser.newContext();
  const captainPage = await captainContext.newPage();
  await signIn(captainPage, captainEmail, captainPassword);
  await measure(captainPage, "/id/captain");
  await measure(captainPage, "/id/captain/stats");
  await measure(captainPage, "/id/captain/settings");
  await captainContext.close();
} finally {
  await browser.close();
}
