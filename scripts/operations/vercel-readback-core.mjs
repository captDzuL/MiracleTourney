// Read-only evaluation of the Vercel project configuration against the V3 cutover preconditions.
// Pure functions only: the CLI wrapper does the (GET-only) network calls. Secret values are never read or printed;
// only FEATURE_FLAG_* values are reported, and only when they are the literal strings "true" or "false".

export const V3_FLAGS = [
  "FEATURE_FLAG_UI_V3_FOUNDATION",
  "FEATURE_FLAG_ORGANIZER_MASTER_SHELL_V3",
  "FEATURE_FLAG_PUBLIC_DISCOVERY_V3",
  "FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3",
  "FEATURE_FLAG_COMPLETION_WORKSPACE_V3",
  "FEATURE_FLAG_COMPETITION_OPERATIONS_V3",
  "FEATURE_FLAG_REGISTRATION_WORKSPACE_V3",
  "FEATURE_FLAG_ORGANIZER_WORKSPACE_V3",
];

const TARGETS = ["production", "preview"];

function targetsOf(env) {
  return Array.isArray(env.target) ? env.target : typeof env.target === "string" ? [env.target] : [];
}

export function summarizeFlags(envs) {
  const flags = {};
  for (const env of envs) {
    if (typeof env.key !== "string" || !env.key.startsWith("FEATURE_FLAG_")) continue;
    const value = env.value === "true" || env.value === "false" ? env.value : "(not readable)";
    for (const target of targetsOf(env)) (flags[env.key] ??= {})[target] = value;
  }
  return flags;
}

export function evaluateReadback({ project, envs }) {
  const findings = [];
  const buildCommand = typeof project.buildCommand === "string" ? project.buildCommand : null;
  const productionBranch = project.link?.productionBranch ?? null;

  if (buildCommand === null) {
    findings.push({ id: "build-command-default", level: "info", message: "No build command override; Vercel uses the package.json vercel-build script." });
  } else if (/\bmigrate\s+deploy\b/.test(buildCommand)) {
    findings.push({ id: "build-runs-migrate-deploy", level: "blocker", message: "Build command override runs `prisma migrate deploy`: any production build would migrate the production database automatically." });
  } else if (buildCommand.trim() !== "pnpm vercel-build") {
    findings.push({ id: "build-command-custom", level: "warning", message: `Build command override differs from \`pnpm vercel-build\`: ${buildCommand}` });
  }

  // scripts/vercel-build.mjs refuses Preview builds unless all three exist for the Preview target.
  const buildUsesGuard = buildCommand === null || /\bvercel-build\b/.test(buildCommand);
  const missingForPreview = ["DATABASE_URL", "DIRECT_URL", "NEON_PROD_HOST"].filter((key) => !envs.some((env) => env.key === key && targetsOf(env).includes("preview")));
  if (buildUsesGuard && missingForPreview.length > 0) {
    findings.push({ id: "preview-build-guard-env-missing", level: "blocker", message: `Preview builds will fail: ${missingForPreview.join(", ")} missing for the Preview target (required by scripts/vercel-build.mjs).` });
  }

  if (productionBranch === null) {
    findings.push({ id: "production-branch-unknown", level: "warning", message: "Production branch could not be read." });
  } else {
    findings.push({ id: "production-branch", level: "info", message: `Production branch is \`${productionBranch}\`.` });
  }

  const flags = summarizeFlags(envs);
  const enabledV3 = V3_FLAGS.filter((key) => TARGETS.includes("production") && flags[key]?.production === "true");
  if (enabledV3.length > 0) {
    findings.push({
      id: "v3-flags-on-in-production",
      level: "blocker",
      message: `${enabledV3.length}/${V3_FLAGS.length} V3 flags are already true for the production target: a production deploy would show V3 immediately.`,
    });
  }
  const unreadable = V3_FLAGS.filter((key) => TARGETS.some((target) => flags[key]?.[target] === "(not readable)"));
  if (unreadable.length > 0) {
    findings.push({ id: "v3-flags-unreadable", level: "warning", message: `${unreadable.length} V3 flag value(s) are not readable with this token; verify them in the dashboard.` });
  }

  return { findings, flags, buildCommand, productionBranch, ok: !findings.some((finding) => finding.level === "blocker") };
}

export function formatReadback(result) {
  const lines = ["Vercel read-back (names and flag values only, no secrets)", ""];
  lines.push(`buildCommand: ${result.buildCommand ?? "(none - uses package.json vercel-build)"}`);
  lines.push(`productionBranch: ${result.productionBranch ?? "(unknown)"}`, "", "Feature flags:");
  for (const key of Object.keys(result.flags).sort()) {
    const perTarget = Object.entries(result.flags[key]).sort().map(([target, value]) => `${target}=${value}`).join(" ");
    lines.push(`  ${key}: ${perTarget}`);
  }
  lines.push("", "Findings:");
  for (const finding of result.findings) lines.push(`  [${finding.level.toUpperCase()}] ${finding.id}: ${finding.message}`);
  lines.push("", result.ok ? "RESULT: no cutover blocker found." : "RESULT: cutover blocked (see BLOCKER findings).");
  return lines.join("\n");
}

async function getJson(fetchImpl, url, token, attempts = 3) {
  // GET is idempotent, so a dropped connection is retried; an HTTP error status is final.
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      continue;
    }
    if (!response.ok) throw new Error(`Vercel API GET ${new URL(url).pathname} failed with HTTP ${response.status}`);
    return response.json();
  }
}

export async function fetchReadback({ token, projectName = "miracle-tourney", teamId, teamSlug, fetchImpl = fetch }) {
  if (!token) throw new Error("VERCEL_TOKEN is required.");
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : teamSlug ? `?slug=${encodeURIComponent(teamSlug)}` : "";
  const base = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`;
  const project = await getJson(fetchImpl, `${base}${query}`, token);
  // The list endpoint never decrypts. Only FEATURE_FLAG_* entries are fetched one by one to read their literal
  // value; every other variable is reported by name only and its value is never requested.
  const raw = (await getJson(fetchImpl, `${base}/env${query}`, token)).envs ?? [];
  const envs = [];
  for (const env of raw) {
    const entry = { key: env.key, target: env.target };
    if (typeof env.key === "string" && env.key.startsWith("FEATURE_FLAG_") && typeof env.id === "string") {
      const detail = await getJson(fetchImpl, `https://api.vercel.com/v1/projects/${encodeURIComponent(projectName)}/env/${encodeURIComponent(env.id)}${query}`, token);
      entry.value = detail.value;
    }
    envs.push(entry);
  }
  return { project, envs };
}
