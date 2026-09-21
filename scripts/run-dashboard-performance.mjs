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
const PERFORMANCE_OBSERVER_INIT = `
(() => {
  const state = { lcp: null, inp: null, cls: 0, clsAvailable: false };
  window.__miracleDashboardPerformance = state;
  if (typeof PerformanceObserver !== "function") return;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = Number(entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.inp = Math.max(state.inp ?? 0, Number(entry.duration) || 0);
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      state.clsAvailable = true;
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) state.cls += Number(entry.value) || 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
    state.clsAvailable = true;
  } catch {}
})();`;

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

const observedPages = new WeakSet();
async function preparePerformanceObservers(page) {
  if (observedPages.has(page)) return;
  await page.addInitScript({ content: PERFORMANCE_OBSERVER_INIT });
  observedPages.add(page);
}

async function recordRepresentativeInteraction(page) {
  await page.locator("body").click({ position: { x: 4, y: 4 }, force: true });
  await page.waitForTimeout(50);
}

async function measure(page, path) {
  const startedAt = performance.now();
  await preparePerformanceObservers(page);
  await page.goto(new URL(path, baseUrl).toString(), { waitUntil: "networkidle" });
  await recordRepresentativeInteraction(page);
  const duration = Math.round(performance.now() - startedAt);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const observed = window.__miracleDashboardPerformance;
    const ttfb = navigation && "responseStart" in navigation && "requestStart" in navigation
      ? Number(navigation.responseStart) - Number(navigation.requestStart)
      : null;
    const lcp = typeof observed?.lcp === "number" && Number.isFinite(observed.lcp) ? observed.lcp : null;
    const inp = typeof observed?.inp === "number" && Number.isFinite(observed.inp) ? observed.inp : null;
    const cls = observed?.clsAvailable && typeof observed.cls === "number" && Number.isFinite(observed.cls) ? observed.cls : null;
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
  ].flatMap(([name, value, budget]) => typeof value !== "number" || !Number.isFinite(value) || value >= budget ? [`${name}=${value ?? "unavailable"} (budget < ${budget})`] : []);
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
