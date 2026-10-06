import type { Browser, HTTPRequest } from "puppeteer-core";
import { RENDER_SENTINEL_ID } from "./template";

// Local dev (incl. Windows) uses the full `puppeteer` package, which ships
// its own Chromium binary. Vercel's serverless functions use `puppeteer-core`
// with `@sparticuz/chromium`'s prebuilt Linux binary instead, since a full
// Chromium download doesn't fit in a Lambda deployment. Both paths render
// through the same `puppeteer-core` Browser API.
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

const RENDER_TIMEOUT_MS = 20_000;

export class RenderIntegrityError extends Error {}

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Promise<Browser>;
  }

  const puppeteer = await import("puppeteer");
  return puppeteer.launch({ headless: true }) as unknown as Promise<Browser>;
}

// One browser per process, reused across renders (launching Chromium costs
// seconds); every render still gets its own fresh, isolated browser context.
// A crashed or closed browser is relaunched on the next render.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const launching = launchBrowser();
    browserPromise = launching;
    launching.then(
      (browser) =>
        browser.on("disconnected", () => {
          if (browserPromise === launching) browserPromise = null;
        }),
      () => {
        if (browserPromise === launching) browserPromise = null;
      },
    );
  }
  return browserPromise;
}

export async function closeRenderer(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (pending) await (await pending.catch(() => null))?.close();
}

// The page may load nothing from anywhere: the HTML is set directly and
// every request the document would make (images, stylesheets, fonts,
// frames, navigations, file: URLs) is aborted. Combined with JavaScript
// being disabled, untrusted text that slipped into the HTML can neither
// execute nor reach the network or the filesystem.
function allowOnlyTheDocumentItself(request: HTTPRequest) {
  const url = request.url();
  if (url === "about:blank" || url.startsWith("data:")) {
    void request.continue();
  } else {
    void request.abort("blockedbyclient");
  }
}

export async function renderHtmlToPdf(
  html: string,
  footerHtml: string,
): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", allowOnlyTheDocumentItself);

    await page.setContent(html, { waitUntil: "load" });

    // A blocked navigation (e.g. a meta refresh) replaces the document with
    // an error page and would otherwise print a blank PDF without failing.
    // Checked before and after printing, since a navigation can land while
    // the PDF is being generated — in which case Chromium may instead abort
    // the print with a protocol error; that is classified the same way.
    let navigated = false;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigated = true;
    });
    const integrityError = () =>
      new RenderIntegrityError(
        "The agreement did not render as expected; refusing to produce a PDF.",
      );
    const assertIntact = async () => {
      if (navigated || page.url() !== "about:blank" || !(await page.$(`#${RENDER_SENTINEL_ID}`))) {
        throw integrityError();
      }
    };

    try {
      await assertIntact();
      const pdf = await page.pdf({
        format: "letter",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: footerHtml,
      });
      await assertIntact();
      return Buffer.from(pdf);
    } catch (error) {
      if (error instanceof RenderIntegrityError) throw error;
      // Let any in-flight navigation event arrive before deciding.
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (navigated || page.url() !== "about:blank") throw integrityError();
      throw error;
    }
  } finally {
    await context.close().catch(() => {});
  }
}
