import { spawn as defaultSpawn } from "node:child_process";
import * as os from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateE2eDatabaseConfiguration } from "./e2e-db-preflight.mjs";
import { loadE2eEnvironment } from "./e2e-env.mjs";

const E2E_V3_FEATURE_FLAGS = [
  "FEATURE_FLAG_UI_V3_FOUNDATION",
  "FEATURE_FLAG_ORGANIZER_WORKSPACE_V3",
  "FEATURE_FLAG_REGISTRATION_WORKSPACE_V3",
  "FEATURE_FLAG_COMPETITION_OPERATIONS_V3",
  "FEATURE_FLAG_COMPLETION_WORKSPACE_V3",
  "FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3",
  "FEATURE_FLAG_PUBLIC_DISCOVERY_V3",
];

const MIB_BYTES = 1_048_576;
const MAX_HEAP_MIB = 10_240;
const HEAP_HEADROOM_RATIO = 0.625;
const CALLER_HEAP_OPTION_PATTERN = /(?:^|\s)--(?:max-old-space-size|max_old_space_size)(?:=|\s+)(\d+)(?=\s|$)/g;

function readMeasuredConstrainedMemory() {
  return typeof os.constrainedMemory === "function" ? os.constrainedMemory() : undefined;
}

function isValidMemoryBytes(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function readCallerHeapMiB(nodeOptions) {
  if (typeof nodeOptions !== "string") return undefined;

  let selectedMiB;
  for (const match of nodeOptions.matchAll(CALLER_HEAP_OPTION_PATTERN)) {
    const normalizedMiB = match[1].replace(/^0+/, "");
    if (normalizedMiB) selectedMiB = normalizedMiB;
  }

  return selectedMiB;
}

function selectMemoryHeadroom({ nodeOptions, systemMemoryBytes, constrainedMemoryBytes }) {
  if (!isValidMemoryBytes(systemMemoryBytes)) {
    throw new Error("Unable to determine a valid system memory limit for the E2E development server.");
  }

  const callerHeapMiB = readCallerHeapMiB(nodeOptions);
  if (callerHeapMiB !== undefined) {
    return { selectedMiB: callerHeapMiB, source: "caller", nodeOptions };
  }

  const useConstrainedMemory =
    isValidMemoryBytes(constrainedMemoryBytes) && constrainedMemoryBytes <= systemMemoryBytes;
  const effectiveBytes = useConstrainedMemory ? constrainedMemoryBytes : systemMemoryBytes;
  const effectiveMiB = Math.floor(effectiveBytes / MIB_BYTES);
  const selectedMiB = Math.max(1, Math.min(MAX_HEAP_MIB, Math.floor(effectiveMiB * HEAP_HEADROOM_RATIO)));
  const derivedNodeOptions = nodeOptions
    ? `${nodeOptions} --max-old-space-size=${selectedMiB}`
    : `--max-old-space-size=${selectedMiB}`;

  return {
    selectedMiB,
    source: useConstrainedMemory ? "constrained" : "system",
    nodeOptions: derivedNodeOptions,
  };
}

export function startE2eDevServer(options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    args = process.argv.slice(2),
    spawnImpl = defaultSpawn,
    systemMemoryBytes: injectedSystemMemoryBytes,
    constrainedMemoryBytes: injectedConstrainedMemoryBytes,
    logger = console.log,
  } = options;
  const hasSystemMemoryOverride = Object.prototype.hasOwnProperty.call(options, "systemMemoryBytes");
  const hasConstrainedMemoryOverride = Object.prototype.hasOwnProperty.call(options, "constrainedMemoryBytes");

  const serverEnvironment = loadE2eEnvironment({ cwd, env });
  const validation = validateE2eDatabaseConfiguration(serverEnvironment);
  if (!validation.ok) {
    throw new Error(`[e2e-db-preflight] ${validation.message} Host: ${validation.host}`);
  }

  for (const flag of E2E_V3_FEATURE_FLAGS) {
    serverEnvironment[flag] = "true";
  }
  if (serverEnvironment.E2E_COMPETITION_FLAGS_OFF === "true") {
    serverEnvironment.FEATURE_FLAG_COMPETITION_OPERATIONS_V3 = "false";
    serverEnvironment.FEATURE_FLAG_COMPLETION_WORKSPACE_V3 = "false";
    serverEnvironment.FEATURE_FLAG_ADAPTIVE_PUBLIC_EVENT_V3 = "false";
    serverEnvironment.FEATURE_FLAG_PUBLIC_DISCOVERY_V3 = "false";
  }

  const systemMemoryBytes = hasSystemMemoryOverride ? injectedSystemMemoryBytes : os.totalmem();
  const constrainedMemoryBytes = hasConstrainedMemoryOverride
    ? injectedConstrainedMemoryBytes
    : readMeasuredConstrainedMemory();

  const memoryHeadroom = selectMemoryHeadroom({
    nodeOptions: serverEnvironment.NODE_OPTIONS,
    systemMemoryBytes,
    constrainedMemoryBytes,
  });
  serverEnvironment.NODE_OPTIONS = memoryHeadroom.nodeOptions;
  logger(`[e2e-dev] memory-headroom selectedMiB=${memoryHeadroom.selectedMiB} source=${memoryHeadroom.source}`);

  return spawnImpl(
    process.execPath,
    [resolve(cwd, "node_modules", "next", "dist", "bin", "next"), "dev", ...args],
    {
      cwd,
      env: serverEnvironment,
      stdio: "inherit",
    },
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startE2eDevServer();
  server.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  server.on("error", (error) => {
    console.error(`[e2e-dev] Unable to start Next.js: ${error.message}`);
    process.exitCode = 1;
  });
}
