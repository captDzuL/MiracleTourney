import { spawn, spawnSync } from "node:child_process";

const port = process.env.PLAYWRIGHT_SMOKE_PORT ?? "3101";
const baseUrl = `http://127.0.0.1:${port}`;
const readyUrl = `${baseUrl}/id/login`;
const isWindows = process.platform === "win32";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyUrl);
      if (response.ok) return;
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw lastError ?? new Error("Smoke server did not become ready.");
}

function stopServer(server) {
  if (!server.pid) return;

  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  server.kill("SIGTERM");
}

const server = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", port],
  {
    env: { ...process.env, PLAYWRIGHT_SMOKE_PORT: port },
    stdio: "inherit",
  },
);

try {
  await waitForServer();

  const playwrightArgs = ["test", "-c", "playwright.smoke.config.ts", "--reporter=list"];
  const playwright = isWindows
    ? spawnSync("cmd.exe", ["/c", "node_modules\\.bin\\playwright.CMD", ...playwrightArgs], {
        env: {
          ...process.env,
          PLAYWRIGHT_SKIP_WEBSERVER: "1",
          PLAYWRIGHT_SMOKE_PORT: port,
        },
        stdio: "inherit",
      })
    : spawnSync("node_modules/.bin/playwright", playwrightArgs, {
        env: {
          ...process.env,
          PLAYWRIGHT_SKIP_WEBSERVER: "1",
          PLAYWRIGHT_SMOKE_PORT: port,
        },
        stdio: "inherit",
      });

  process.exitCode = playwright.status ?? 1;
} finally {
  stopServer(server);
  process.exit(process.exitCode ?? 0);
}
