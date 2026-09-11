type Screenshot = Buffer | Uint8Array;

interface CertificatePage {
  setViewportSize?(viewport: { width: number; height: number }): Promise<void>;
  setViewport?(viewport: { width: number; height: number }): Promise<void>;
  setContent(html: string, options: { waitUntil: "networkidle" | "load" }): Promise<void>;
  waitForNetworkIdle?(): Promise<void>;
  screenshot(options: { type: "png"; fullPage: boolean }): Promise<Screenshot>;
}

interface CertificateBrowser {
  newPage(): Promise<CertificatePage>;
  close(): Promise<void>;
}

interface CertificateBrowserLauncher {
  launch(options: Record<string, unknown>): Promise<CertificateBrowser>;
}

interface ServerlessChromium {
  args: string[];
  executablePath(): Promise<string>;
}

export interface CertificateRendererDependencies {
  isVercel?: boolean;
  loadPuppeteer?: () => Promise<CertificateBrowserLauncher>;
  loadServerlessChromium?: () => Promise<ServerlessChromium>;
  loadPlaywrightChromium?: () => Promise<CertificateBrowserLauncher>;
  launchBrowser?: () => Promise<CertificateBrowser>;
}

async function launchSharedBrowser(): Promise<CertificateBrowser> {
  const { launchCertificateBrowser } = await import("./browser");
  return await launchCertificateBrowser() as unknown as CertificateBrowser;
}

/** Renders certificate HTML to a portrait PNG using the browser runtime for the current host. */
export async function renderCertificatePng(
  html: string,
  dependencies: CertificateRendererDependencies = {},
): Promise<Buffer> {
  const usesPuppeteer =
    dependencies.isVercel === true
    && dependencies.loadPuppeteer !== undefined
    && dependencies.loadServerlessChromium !== undefined;
  const browser = dependencies.launchBrowser
    ? await dependencies.launchBrowser()
    : usesPuppeteer
      ? await launchServerlessBrowser(
          dependencies.loadPuppeteer!,
          dependencies.loadServerlessChromium!,
        )
      : dependencies.loadPlaywrightChromium
        ? await launchLocalBrowser(dependencies.loadPlaywrightChromium)
        : await launchSharedBrowser();

  try {
    const page = await browser.newPage();
    if (usesPuppeteer) {
      if (!page.setViewport) throw new Error("Puppeteer page does not support setViewport.");
      await page.setViewport({ width: 1080, height: 1920 });
      await page.setContent(html, { waitUntil: "load" });
      if (!page.waitForNetworkIdle) throw new Error("Puppeteer page does not support waitForNetworkIdle.");
      await page.waitForNetworkIdle();
    } else {
      if (!page.setViewportSize) throw new Error("Playwright page does not support setViewportSize.");
      await page.setViewportSize({ width: 1080, height: 1920 });
      await page.setContent(html, { waitUntil: "networkidle" });
    }
    const screenshot = await page.screenshot({ type: "png", fullPage: false });

    return Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}

async function launchServerlessBrowser(
  loadPuppeteer: NonNullable<CertificateRendererDependencies["loadPuppeteer"]>,
  loadServerlessChromium: NonNullable<CertificateRendererDependencies["loadServerlessChromium"]>,
): Promise<CertificateBrowser> {
  const [puppeteer, chromium] = await Promise.all([
    loadPuppeteer(),
    loadServerlessChromium(),
  ]);

  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

async function launchLocalBrowser(
  loadPlaywrightChromium: NonNullable<CertificateRendererDependencies["loadPlaywrightChromium"]>,
): Promise<CertificateBrowser> {
  const chromium = await loadPlaywrightChromium();
  return chromium.launch({ headless: true });
}
