import { config } from "dotenv";
import { basename, resolve } from "node:path";

export const E2E_DATABASE_ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEON_PROD_HOST",
  "E2E_DATABASE_RESET_ALLOWED",
];

export function loadE2eEnvironment({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  for (const key of E2E_DATABASE_ENVIRONMENT_KEYS) {
    delete env[key];
  }

  const path = resolve(cwd, env.E2E_ENV_FILE || ".env.test");
  if (basename(path) !== ".env.test") throw new Error("E2E environment must use a file named .env.test.");
  const result = config({
    path,
    processEnv: env,
    override: true,
    quiet: true,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(`E2E environment file .env.test was not found at ${path}.`);
    }
    throw new Error(`Unable to load E2E environment file .env.test: ${result.error.message}`);
  }

  for (const key of E2E_DATABASE_ENVIRONMENT_KEYS) {
    env[key] ??= "";
  }

  return env;
}
