import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";

/**
 * How a Chromium instance should be obtained for certificate rendering.
 *
 * - `channel` — drive a browser already installed on the machine (local Windows/macOS dev,
 *   where `playwright-core` has no bundled binary and `PLAYWRIGHT_CHANNEL` names e.g. `msedge`).
 * - `lambda`  — serverless (Vercel/AWS). No browser exists on the filesystem, so a Chromium build
 *   compiled for Lambda is downloaded and inflated from a remote brotli pack.
 * - `local`   — a normal machine where `playwright-core` can find a browser on its own.
 */
export type LaunchStrategy = "channel" | "lambda" | "local";

/** Environment variable that must point at a `chromium-vX.Y.Z-pack.x64.tar` asset. */
export const CHROMIUM_PACK_URL_ENV = "CHROMIUM_PACK_URL";

/**
 * Picks a launch strategy from the environment.
 *
 * Pure and dependency-free so the decision can be unit tested without touching a browser.
 * An explicit `PLAYWRIGHT_CHANNEL` wins over serverless detection: a developer who has asked
 * for a specific local browser should always get it.
 */
export function resolveLaunchStrategy(env: NodeJS.ProcessEnv): LaunchStrategy {
  if (env.PLAYWRIGHT_CHANNEL) return "channel";
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return "lambda";
  return "local";
}

/**
 * Launches Chromium for certificate rendering.
 *
 * `playwright-core` deliberately ships without a browser binary, so on Vercel there is nothing to
 * launch unless we supply one. Callers are expected to let failures propagate — the message is
 * persisted on the certificate row so an admin can see why generation failed.
 */
export async function launchCertificateBrowser(env: NodeJS.ProcessEnv = process.env): Promise<Browser> {
  const strategy = resolveLaunchStrategy(env);

  if (strategy === "channel") {
    return chromium.launch({ channel: env.PLAYWRIGHT_CHANNEL, headless: true });
  }

  if (strategy === "lambda") {
    const packUrl = env[CHROMIUM_PACK_URL_ENV];
    if (!packUrl) {
      throw new Error(
        `${CHROMIUM_PACK_URL_ENV} is not set. Serverless certificate rendering needs a Chromium `
          + "brotli pack URL (a chromium-vX.Y.Z-pack.x64.tar asset). Set it in the Vercel project "
          + "settings for both Production and Preview.",
      );
    }

    const { default: lambdaChromium } = await import("@sparticuz/chromium-min");
    // The certificate is CSS + inline SVG only; skipping the WebGL stack avoids inflating
    // swiftshader on every cold start.
    lambdaChromium.setGraphicsMode = false;

    return chromium.launch({
      args: lambdaChromium.args,
      executablePath: await lambdaChromium.executablePath(packUrl),
      headless: true,
    });
  }

  return chromium.launch({ headless: true });
}
