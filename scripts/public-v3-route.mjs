import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { PUBLIC_PHASES } from "./public-v3-ci.mjs";

const BRANCH = "codex/public-event-overview-v3";
const BASE = "feature/ui/release/1.0";
const CHECK = "Public V3 E2E";
const REPOSITORY = "captDzuL/MiracleTourney";
const REPOSITORY_ID = 1316699241;
const MAX_ARCHIVE_BYTES = 2_000_000;
const MAX_FILE_BYTES = 1_000_000;
// CI route runs before dependency installation; keep this proof contract built-in.
export const EXPECTED_PRESSURE_SCENARIOS = [
  { path: "/id/login", requests: 80, concurrency: 20, p95Ms: 3000, statuses: [200] },
  { path: "/api/me", requests: 80, concurrency: 20, p95Ms: 3000, statuses: [200] },
  { path: "/id/admin", requests: 40, concurrency: 10, p95Ms: 3000, statuses: [200, 307] },
  ...["id", "en"].flatMap((locale) => [
    { path: `/${locale}`, requests: 40, concurrency: 10, p95Ms: 3000, statuses: [200] },
    { path: `/${locale}/events`, requests: 40, concurrency: 10, p95Ms: 3000, statuses: [200] },
    { path: `/${locale}/events/flashpeak-champions-32`, requests: 40, concurrency: 10, p95Ms: 3000, statuses: [200] },
    { path: `/${locale}/events/flashpeak-champions-32/bracket`, requests: 40, concurrency: 10, p95Ms: 3000, statuses: [200] },
  ]),
];

export function routePublicV3(input, hasEvidence = false) {
  if (input.event === "push") {
    if (input.branch === BRANCH && input.message?.includes("[ci:public-v3-home]")) return "home";
    if (input.branch === BRANCH && input.message?.includes("[ci:public-v3-full]")) return "run";
    if (input.branch === BRANCH && input.message?.includes("[ci:public-v3-only]")) return "diagnostic";
    return "full";
  }
  if (input.event === "pull_request") {
    if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(input.action)) throw new Error("Unknown pull request action.");
    if (input.head === BRANCH && input.base === BASE) {
      if (input.repository !== REPOSITORY || input.repositoryId !== REPOSITORY_ID
        || input.headRepositoryId !== REPOSITORY_ID || input.baseRepositoryId !== REPOSITORY_ID) throw new Error("Untrusted pull request repository.");
      if (!/^[a-f0-9]{40}$/i.test(input.sha ?? "")) throw new Error("Invalid pull request head SHA.");
      if (!hasEvidence) throw new Error("Full-public push evidence is unavailable.");
      return "verify";
    }
    return "full";
  }
  throw new Error("Unknown CI event.");
}

export function matchingPublicEvidence(target, runs, jobsByRun, artifactsByRun) {
  return runs.some((run) =>
    run.head_sha === target.sha &&
    run.head_branch === BRANCH &&
    run.event === "push" &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    run.path === ".github/workflows/ci.yml" &&
    run.repository?.id === target.repositoryId && run.repository?.full_name === target.repository &&
    run.head_repository?.id === target.repositoryId && run.head_repository?.full_name === target.repository &&
    (jobsByRun[run.id] ?? []).some((job) =>
      job.name === CHECK && job.status === "completed" && job.conclusion === "success" && job.head_sha === target.sha && job.run_id === run.id,
    ) && (artifactsByRun[run.id] ?? []).some((artifact) => artifact.name === "public-v3-evidence" && artifact.expired === false
      && artifact.workflow_run?.id === run.id && artifact.workflow_run?.head_sha === target.sha
      && artifact.workflow_run?.repository_id === target.repositoryId),
  );
}

function validPressureSample(sample, scenario, initial) {
  const requests = initial ? 1 : scenario.requests;
  const concurrency = initial ? 1 : scenario.concurrency;
  const latency = initial ? sample?.initialLatencyMs : sample?.p95Ms;
  const statusCounts = sample?.statusCounts;
  return sample?.path === scenario.path && sample.requests === requests && sample.concurrency === concurrency
    && sample.completed === requests && sample.failures === 0 && sample.passed === true
    && Array.isArray(sample.failureKinds) && sample.failureKinds.length === 0
    && Number.isFinite(latency) && latency >= 0 && (initial || latency < scenario.p95Ms)
    && Number.isFinite(sample.maxMs) && sample.maxMs >= latency && sample.maxMs <= 10_000
    && (initial ? sample.p95Ms === undefined : sample.initialLatencyMs === undefined)
    && !sample.contentDiagnostics && statusCounts && typeof statusCounts === "object" && !Array.isArray(statusCounts)
    && Object.entries(statusCounts).every(([status, count]) => scenario.statuses.includes(Number(status)) && Number.isInteger(count) && count >= 0)
    && Object.values(statusCounts).reduce((total, count) => total + count, 0) === requests;
}

export function validatePublicArtifact(sha, { evidence, pressure } = {}) {
  if (!/^[a-f0-9]{40}$/i.test(sha ?? "") || evidence?.sha !== sha || evidence.mode !== "full-public" || evidence.status !== "passed"
    || JSON.stringify(evidence.exclusions) !== JSON.stringify(["three public-v3-seeded-events seed/reseed cases"])
    || !Array.isArray(evidence.phases) || evidence.phases.length !== PUBLIC_PHASES.length) return false;
  let total = 0;
  const allIds = new Set();
  for (let phaseIndex = 0; phaseIndex < PUBLIC_PHASES.length; phaseIndex++) {
    const expectedPhase = PUBLIC_PHASES[phaseIndex];
    const phase = evidence.phases[phaseIndex];
    if (phase?.id !== expectedPhase.id || phase.expected !== expectedPhase.expected || phase.passed !== expectedPhase.expected
      || !Array.isArray(phase.selections) || phase.selections.length !== expectedPhase.selections.length) return false;
    for (let selectionIndex = 0; selectionIndex < expectedPhase.selections.length; selectionIndex++) {
      const expected = expectedPhase.selections[selectionIndex];
      const selected = phase.selections[selectionIndex];
      if (selected?.id !== expected.id || JSON.stringify(selected.args) !== JSON.stringify(expected.args)
        || selected.listed !== expected.expected || selected.passed !== expected.expected
        || selected.failed !== 0 || selected.skipped !== 0 || selected.flaky !== 0
        || !Number.isFinite(selected.elapsedMs) || selected.elapsedMs < 0
        || !Array.isArray(selected.failedCases) || selected.failedCases.length !== 0
        || !Array.isArray(selected.manifest) || selected.manifest.length !== expected.expected) return false;
      for (const item of selected.manifest) {
        if (typeof item?.id !== "string" || !item.id || allIds.has(item.id) || typeof item.file !== "string" || !item.file
          || typeof item.title !== "string" || !item.title || !Number.isInteger(item.line) || item.line < 1
          || !Number.isInteger(item.column) || item.column < 0) return false;
        allIds.add(item.id);
      }
      total += selected.passed;
    }
  }
  if (total !== 54 || pressure?.sha !== sha || pressure.mode !== "production-like"
    || pressure.policy !== "initial-warning-load-strict-v1" || pressure.status !== "passed"
    || pressure.environment !== "guarded E2E test database" || !Number.isFinite(pressure.buildMs) || pressure.buildMs < 0
    || !Array.isArray(pressure.warmups) || pressure.warmups.length !== EXPECTED_PRESSURE_SCENARIOS.length
    || !Array.isArray(pressure.scenarios) || pressure.scenarios.length !== EXPECTED_PRESSURE_SCENARIOS.length
    || !Array.isArray(pressure.initialLatencyWarnings)) return false;
  const warnings = [];
  for (let index = 0; index < EXPECTED_PRESSURE_SCENARIOS.length; index++) {
    const scenario = EXPECTED_PRESSURE_SCENARIOS[index];
    const warmup = pressure.warmups[index];
    if (!validPressureSample(warmup, scenario, true) || !validPressureSample(pressure.scenarios[index], scenario, false)) return false;
    if (warmup.initialLatencyMs >= scenario.p95Ms) warnings.push({ path: scenario.path, latencyMs: warmup.initialLatencyMs, thresholdMs: scenario.p95Ms });
  }
  return JSON.stringify(pressure.initialLatencyWarnings) === JSON.stringify(warnings);
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function decodePublicEvidenceArchive(bytes) {
  const archive = Buffer.from(bytes);
  if (archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) throw new Error("Invalid public evidence archive size.");
  let end = -1;
  for (let index = archive.length - 22; index >= Math.max(0, archive.length - 65_557); index--) {
    if (archive.readUInt32LE(index) === 0x06054b50 && index + 22 + archive.readUInt16LE(index + 20) === archive.length) { end = index; break; }
  }
  if (end < 0 || archive.readUInt16LE(end + 4) !== 0 || archive.readUInt16LE(end + 6) !== 0
    || archive.readUInt16LE(end + 8) !== 2 || archive.readUInt16LE(end + 10) !== 2) throw new Error("Invalid public evidence archive directory.");
  const directorySize = archive.readUInt32LE(end + 12);
  const directoryOffset = archive.readUInt32LE(end + 16);
  if (directoryOffset + directorySize !== end) throw new Error("Invalid public evidence archive directory bounds.");
  let cursor = directoryOffset;
  const result = {};
  for (let entry = 0; entry < 2; entry++) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid public evidence archive entry.");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameSize = archive.readUInt16LE(cursor + 28);
    const extraSize = archive.readUInt16LE(cursor + 30);
    const commentSize = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > end || (flags & 1) || ![0, 8].includes(method) || size > MAX_FILE_BYTES || compressedSize > MAX_ARCHIVE_BYTES
      || localOffset + 30 > directoryOffset || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid public evidence archive entry bounds.");
    const name = archive.subarray(cursor + 46, cursor + 46 + nameSize).toString("utf8");
    if (!["pressure.json", "evidence.json", "test-results/public-v3/pressure.json", "test-results/public-v3/evidence.json"].includes(name)) throw new Error("Unexpected public evidence archive file.");
    const key = name.endsWith("pressure.json") ? "pressure" : "evidence";
    if (result[key]) throw new Error("Duplicate public evidence archive file.");
    if (archive.readUInt16LE(localOffset + 8) !== method) throw new Error("Invalid public evidence archive method.");
    const localNameSize = archive.readUInt16LE(localOffset + 26);
    const localExtraSize = archive.readUInt16LE(localOffset + 28);
    if (archive.subarray(localOffset + 30, localOffset + 30 + localNameSize).toString("utf8") !== name) throw new Error("Invalid public evidence archive local name.");
    const dataStart = localOffset + 30 + localNameSize + localExtraSize;
    if (dataStart + compressedSize > directoryOffset) throw new Error("Invalid public evidence archive data bounds.");
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_FILE_BYTES }) : compressed;
    if (data.length !== size || crc32(data) !== checksum) throw new Error("Invalid public evidence archive checksum.");
    try { result[key] = JSON.parse(data.toString("utf8")); }
    catch { throw new Error("Invalid public evidence archive JSON."); }
    cursor = next;
  }
  if (cursor !== end || !result.pressure || !result.evidence) throw new Error("Incomplete public evidence archive.");
  return result;
}

async function readBounded(response, maximum) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error("GitHub evidence response is too large.");
  if (!response.body?.getReader) throw new Error("GitHub evidence response has no readable body.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) throw new Error("GitHub evidence response is too large.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks, length);
}

export async function findEvidence({ repository, sha, token, fetchImpl = fetch }) {
  if (repository !== REPOSITORY || !/^[a-f0-9]{40}$/i.test(sha) || !token) throw new Error("Invalid evidence lookup input.");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const api = async (path) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`GitHub evidence lookup failed with status ${response.status}.`);
    return response;
  };
  const get = async (path) => JSON.parse((await readBounded(await api(path), MAX_ARCHIVE_BYTES)).toString("utf8"));
  const result = await get(`/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`);
  if (!Array.isArray(result.workflow_runs) || result.workflow_runs.length > 20) throw new Error("Invalid GitHub workflow-run list.");
  const target = { repository, repositoryId: REPOSITORY_ID, sha };
  const candidates = result.workflow_runs.filter((run) => run.head_sha === sha && run.head_branch === BRANCH && run.event === "push"
    && run.status === "completed" && run.conclusion === "success" && run.path === ".github/workflows/ci.yml"
    && run.repository?.id === REPOSITORY_ID && run.repository?.full_name === REPOSITORY
    && run.head_repository?.id === REPOSITORY_ID && run.head_repository?.full_name === REPOSITORY);
  if (candidates.length > 5) throw new Error("Too many matching GitHub workflow runs.");
  for (const run of candidates) {
    if (!Number.isSafeInteger(run.id) || run.id < 1) throw new Error("Invalid GitHub workflow-run identity.");
    const jobs = await get(`/actions/runs/${run.id}/jobs?per_page=100`);
    const artifacts = await get(`/actions/runs/${run.id}/artifacts?per_page=100`);
    if (!Array.isArray(jobs.jobs) || jobs.jobs.length > 100 || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length > 100) throw new Error("Invalid GitHub job or artifact list.");
    if (!matchingPublicEvidence(target, [run], { [run.id]: jobs.jobs }, { [run.id]: artifacts.artifacts })) continue;
    const matchingArtifacts = artifacts.artifacts.filter((item) => item.name === "public-v3-evidence" && item.expired === false
      && item.workflow_run?.id === run.id && item.workflow_run?.head_sha === sha && item.workflow_run?.repository_id === REPOSITORY_ID);
    if (matchingArtifacts.length !== 1) continue;
    for (const artifact of matchingArtifacts) {
      if (!Number.isSafeInteger(artifact.id) || artifact.id < 1 || !Number.isSafeInteger(artifact.size_in_bytes)
        || artifact.size_in_bytes < 1 || artifact.size_in_bytes > MAX_ARCHIVE_BYTES) continue;
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
        { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
      let archiveResponse = response;
      if (response.status === 302) {
        const signed = new URL(response.headers.get("location") ?? "", "https://api.github.com");
        if (signed.protocol !== "https:" || !/^productionresultssa\d+\.blob\.core\.windows\.net$/.test(signed.hostname)) throw new Error("Untrusted GitHub artifact redirect.");
        archiveResponse = await fetchImpl(signed.href, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      }
      if (!archiveResponse.ok) throw new Error(`GitHub artifact download failed with status ${archiveResponse.status}.`);
      try {
        const proof = decodePublicEvidenceArchive(await readBounded(archiveResponse, MAX_ARCHIVE_BYTES));
        if (validatePublicArtifact(sha, proof)) return true;
      } catch { /* Invalid or incomplete artifact is never reusable. */ }
    }
  }
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const payload = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const input = process.env.GITHUB_EVENT_NAME === "push"
      ? { event: "push", branch: process.env.GITHUB_REF_NAME, message: payload.head_commit?.message, sha: process.env.GITHUB_SHA }
      : { event: process.env.GITHUB_EVENT_NAME, action: payload.action, draft: payload.pull_request?.draft, head: payload.pull_request?.head?.ref, base: payload.pull_request?.base?.ref, sha: payload.pull_request?.head?.sha,
        repository: payload.repository?.full_name, repositoryId: payload.repository?.id, headRepositoryId: payload.pull_request?.head?.repo?.id, baseRepositoryId: payload.pull_request?.base?.repo?.id };
    const eligible = input?.event === "pull_request" && input.head === BRANCH && input.base === BASE;
    if (eligible && (input.repository !== REPOSITORY || input.repositoryId !== REPOSITORY_ID || input.headRepositoryId !== REPOSITORY_ID || input.baseRepositoryId !== REPOSITORY_ID)) throw new Error("Untrusted pull request repository.");
    const hasEvidence = eligible ? await findEvidence({ repository: process.env.GITHUB_REPOSITORY, sha: input.sha, token: process.env.GITHUB_TOKEN }) : false;
    const route = routePublicV3(input, hasEvidence);
    if (!process.env.GITHUB_OUTPUT) throw new Error("GitHub output path is unavailable.");
    await appendFile(process.env.GITHUB_OUTPUT, `route=${route}\n`);
    console.log(`[public-v3-route] ${route} sha=${input.sha ?? "unavailable"}`);
  } catch {
    console.error("[public-v3-route] Could not prove safe CI routing.");
    process.exitCode = 1;
  }
}
