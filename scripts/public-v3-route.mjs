import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BRANCH = "codex/public-event-overview-v3";
const BASE = "feature/ui/release/1.0";
const CHECK = "Public V3 E2E";

export function routePublicV3(input, hasEvidence = false) {
  if (input.event === "push") {
    if (input.branch === BRANCH && input.message?.includes("[ci:public-v3-full]")) return "run";
    if (input.branch === BRANCH && input.message?.includes("[ci:public-v3-only]")) return "diagnostic";
    return "full";
  }
  if (input.event === "pull_request") {
    if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(input.action)) throw new Error("Unknown pull request action.");
    if (input.draft === true && input.head === BRANCH && input.base === BASE) return hasEvidence ? "verify" : "run";
    return "full";
  }
  throw new Error("Unknown CI event.");
}

export function matchingPublicEvidence(target, runs, jobsByRun, artifactsByRun) {
  return runs.some((run) =>
    run.head_sha === target.sha &&
    run.head_branch === BRANCH &&
    run.event === "push" &&
    run.conclusion === "success" &&
    run.path === ".github/workflows/ci.yml" &&
    (jobsByRun[run.id] ?? []).some((job) =>
      job.name === CHECK && job.conclusion === "success" && job.head_sha === target.sha,
    ) && (artifactsByRun[run.id] ?? []).some((artifact) => artifact.name === "public-v3-evidence" && artifact.expired === false),
  );
}

export async function findEvidence({ repository, sha, token, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f0-9]{40}$/i.test(sha) || !token) throw new Error("Invalid evidence lookup input.");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const get = async (path) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub evidence lookup failed with status ${response.status}.`);
    return response.json();
  };
  const result = await get(`/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`);
  const runs = result.workflow_runs ?? [];
  const jobsByRun = {};
  const artifactsByRun = {};
  for (const run of runs.filter((run) => run.head_sha === sha && run.head_branch === BRANCH && run.event === "push" && run.conclusion === "success" && run.path === ".github/workflows/ci.yml")) {
    const jobs = await get(`/actions/runs/${run.id}/jobs?per_page=100`);
    jobsByRun[run.id] = jobs.jobs ?? [];
    const artifacts = await get(`/actions/runs/${run.id}/artifacts?per_page=100`);
    artifactsByRun[run.id] = artifacts.artifacts ?? [];
  }
  return matchingPublicEvidence({ repository, sha }, runs, jobsByRun, artifactsByRun);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const payload = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const input = process.env.GITHUB_EVENT_NAME === "push"
      ? { event: "push", branch: process.env.GITHUB_REF_NAME, message: payload.head_commit?.message, sha: process.env.GITHUB_SHA }
      : { event: process.env.GITHUB_EVENT_NAME, action: payload.action, draft: payload.pull_request?.draft, head: payload.pull_request?.head?.ref, base: payload.pull_request?.base?.ref, sha: payload.pull_request?.head?.sha };
    const eligibleDraft = input?.event === "pull_request" && input.draft === true && input.head === BRANCH && input.base === BASE;
    const hasEvidence = eligibleDraft ? await findEvidence({ repository: process.env.GITHUB_REPOSITORY, sha: input.sha, token: process.env.GITHUB_TOKEN }) : false;
    const route = routePublicV3(input, hasEvidence);
    if (!process.env.GITHUB_OUTPUT) throw new Error("GitHub output path is unavailable.");
    await appendFile(process.env.GITHUB_OUTPUT, `route=${route}\n`);
    console.log(`[public-v3-route] ${route} sha=${input.sha ?? "unavailable"}`);
  } catch {
    console.error("[public-v3-route] Could not prove safe CI routing.");
    process.exitCode = 1;
  }
}
