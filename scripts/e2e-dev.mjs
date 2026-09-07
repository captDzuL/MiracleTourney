import { spawn as defaultSpawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadE2eEnvironment } from "./e2e-env.mjs";

const E2E_V3_FEATURE_FLAGS = [
  "FEATURE_FLAG_UI_V3_FOUNDATION",
  "FEATURE_FLAG_ORGANIZER_WORKSPACE_V3",
  "FEATURE_FLAG_REGISTRATION_WORKSPACE_V3",
  "FEATURE_FLAG_COMPETITION_OPERATIONS_V3",
];

export function startE2eDevServer({
  cwd = process.cwd(),
  env = process.env,
  args = process.argv.slice(2),
  spawnImpl = defaultSpawn,
} = {}) {
  const serverEnvironment = loadE2eEnvironment({ cwd, env });

  for (const flag of E2E_V3_FEATURE_FLAGS) {
    serverEnvironment[flag] = "true";
  }

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