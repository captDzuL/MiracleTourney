import { describe, expect, test, vi } from "vitest";

import { renderCertificatePng } from "./renderer";

const certificateHtml = "<main>Champion</main>";

describe("renderCertificatePng", () => {
  test("uses Puppeteer and the Vercel Chromium executable when running on Vercel", async () => {
    const png = Buffer.from("serverless-certificate");
    const page = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(png),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const puppeteerLaunch = vi.fn().mockResolvedValue(browser);
    const executablePath = vi.fn().mockResolvedValue("/tmp/chromium");

    await expect(
      renderCertificatePng(certificateHtml, {
        isVercel: true,
        loadPuppeteer: async () => ({ launch: puppeteerLaunch }),
        loadServerlessChromium: async () => ({
          args: ["--serverless"],
          executablePath,
        }),
        loadPlaywrightChromium: async () => {
          throw new Error("local renderer must not load on Vercel");
        },
      }),
    ).resolves.toBe(png);

    expect(puppeteerLaunch).toHaveBeenCalledWith({
      args: ["--serverless"],
      executablePath: "/tmp/chromium",
      headless: true,
    });
    expect(page.setViewport).toHaveBeenCalledWith({ width: 1080, height: 1920 });
    expect(page.setContent).toHaveBeenCalledWith(certificateHtml, { waitUntil: "load" });
    expect(page.waitForNetworkIdle).toHaveBeenCalledOnce();
    expect(page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: false });
    expect(browser.close).toHaveBeenCalledOnce();
  });

  test("keeps the Playwright renderer outside Vercel", async () => {
    const png = Buffer.from("local-certificate");
    const page = {
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(png),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const playwrightLaunch = vi.fn().mockResolvedValue(browser);

    await expect(
      renderCertificatePng(certificateHtml, {
        isVercel: false,
        loadPlaywrightChromium: async () => ({ launch: playwrightLaunch }),
        loadPuppeteer: async () => {
          throw new Error("serverless renderer must not load locally");
        },
        loadServerlessChromium: async () => {
          throw new Error("serverless Chromium must not load locally");
        },
      }),
    ).resolves.toBe(png);

    expect(playwrightLaunch).toHaveBeenCalledWith({ headless: true });
    expect(page.setContent).toHaveBeenCalledWith(certificateHtml, { waitUntil: "networkidle" });
    expect(browser.close).toHaveBeenCalledOnce();
  });

  test("closes the browser when PNG rendering fails", async () => {
    const browser = {
      newPage: vi.fn().mockResolvedValue({
        setViewportSize: vi.fn().mockResolvedValue(undefined),
        setContent: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockRejectedValue(new Error("screenshot failed")),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      renderCertificatePng(certificateHtml, {
        isVercel: false,
        loadPlaywrightChromium: async () => ({ launch: vi.fn().mockResolvedValue(browser) }),
        loadPuppeteer: async () => {
          throw new Error("serverless renderer must not load locally");
        },
        loadServerlessChromium: async () => {
          throw new Error("serverless Chromium must not load locally");
        },
      }),
    ).rejects.toThrow("screenshot failed");

    expect(browser.close).toHaveBeenCalledOnce();
  });
});
  test("renders through the shared browser launcher without separate browser packages", async () => {
    const png = Buffer.from("shared-browser-certificate");
    const page = {
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(png),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      renderCertificatePng(certificateHtml, {
        launchBrowser: async () => browser,
      }),
    ).resolves.toBe(png);

    expect(page.setViewportSize).toHaveBeenCalledWith({ width: 1080, height: 1920 });
    expect(page.setContent).toHaveBeenCalledWith(certificateHtml, { waitUntil: "networkidle" });
    expect(browser.close).toHaveBeenCalledOnce();
  });
