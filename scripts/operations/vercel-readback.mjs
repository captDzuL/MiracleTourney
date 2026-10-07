#!/usr/bin/env node
// GET-only. Usage: VERCEL_TOKEN=... [VERCEL_TEAM_ID=... | VERCEL_TEAM_SLUG=...] node scripts/operations/vercel-readback.mjs
// Exit code 0 = no cutover blocker, 1 = blocker found, 2 = could not read.
import { evaluateReadback, fetchReadback, formatReadback } from "./vercel-readback-core.mjs";

try {
  const data = await fetchReadback({ token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID, teamSlug: process.env.VERCEL_TEAM_SLUG });
  const result = evaluateReadback(data);
  console.log(formatReadback(result));
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(`vercel-readback: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 2;
}
