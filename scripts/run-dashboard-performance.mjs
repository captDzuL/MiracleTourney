import { chromium } from "@playwright/test";

const baseUrl = process.env.DASHBOARD_PERF_BASE_URL;
const adminEmail = process.env.DASHBOARD_ADMIN_EMAIL;
const adminPassword = process.env.DASHBOARD_ADMIN_PASSWORD;
const captainEmail = process.env.DASHBOARD_CAPTAIN_EMAIL;
const captainPassword = process.env.DASHBOARD_CAPTAIN_PASSWORD;
const thresholdMs = Number(process.env.DASHBOARD_PERF_THRESHOLD_MS ?? "1000");

if (!baseUrl || !adminEmail || !adminPassword || !captainEmail || !captainPassword) {
  console.log("Skipping dashboard performance smoke: set DASHBOARD_PERF_BASE_URL, DASHBOARD_ADMIN_EMAIL, DASHBOARD_ADMIN_PASSWORD, DASHBOARD_CAPTAIN_EMAIL, and DASHBOARD_CAPTAIN_PASSWORD.");
  process.exit(0);
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
  console.log(`${path}: ${duration}ms`);
  if (duration > thresholdMs) {
    throw new Error(`${path} loaded in ${duration}ms, above ${thresholdMs}ms threshold.`);
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
