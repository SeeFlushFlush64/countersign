import type { Browser } from "puppeteer-core";

// Local dev (incl. Windows) uses the full `puppeteer` package, which ships
// its own Chromium binary. Vercel's serverless functions use `puppeteer-core`
// with `@sparticuz/chromium`'s prebuilt Linux binary instead, since a full
// Chromium download doesn't fit in a Lambda deployment. Both paths render
// through the same `puppeteer-core` Browser API.
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

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

export async function renderHtmlToPdf(
  html: string,
  footerHtml: string,
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footerHtml,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
