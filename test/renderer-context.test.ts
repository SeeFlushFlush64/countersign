import { afterEach, describe, expect, it, vi } from "vitest";

// On Vercel the PDF renderer runs @sparticuz/chromium, which launches Chromium
// with --single-process. A single-process Chromium cannot create a second,
// isolated browser context: createBrowserContext() followed by newPage() closes
// the browser ("Protocol error (Target.createTarget): Target closed"), and the
// first render (send, preview, the demo reset) fails in production only. The
// full puppeteer used locally and in CI is multi-process, so no real-browser
// test here can notice. These tests drive the renderer with fake browser
// objects instead and pin down, per environment:
//
//   - serverless never creates a browser context (it opens the page in the
//     default context and closes it afterwards); local still isolates every
//     render in its own context;
//   - the launch flags are exactly what each package supplies;
//   - the lockdown (JavaScript off, every request but the document aborted,
//     the blank-PDF navigation guard) holds on both paths.

type Handler = (...args: never[]) => unknown;

const CHROMIUM_ARGS = ["--single-process", "--no-zygote", "--no-sandbox"];
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

type FakeRequest = { url: () => string; abort: ReturnType<typeof vi.fn>; continue: ReturnType<typeof vi.fn> };

function fakeRequest(url: string): FakeRequest {
  return { url: () => url, abort: vi.fn(async () => {}), continue: vi.fn(async () => {}) };
}

function fakePage(options: { pdf?: (page: FakePage) => Promise<Uint8Array> } = {}) {
  const handlers = new Map<string, Handler[]>();
  const frame = { name: "main" };
  const page = {
    handlers,
    frame,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return page;
    }),
    setDefaultTimeout: vi.fn(),
    setJavaScriptEnabled: vi.fn(async () => {}),
    setRequestInterception: vi.fn(async () => {}),
    setContent: vi.fn(async () => {}),
    $: vi.fn(async (): Promise<object | null> => ({})),
    url: vi.fn(() => "about:blank"),
    mainFrame: vi.fn(() => frame),
    pdf: vi.fn(async () => (options.pdf ? options.pdf(page) : PDF_BYTES)),
    close: vi.fn(async () => {}),
  };
  return page;
}
type FakePage = ReturnType<typeof fakePage>;

function emit(page: FakePage, event: string, ...args: unknown[]) {
  for (const handler of page.handlers.get(event) ?? []) (handler as (...a: unknown[]) => unknown)(...args);
}

const ENV_KEYS = ["VERCEL", "AWS_LAMBDA_FUNCTION_NAME"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

// Imports a fresh copy of the renderer (it reads its environment once, when
// first imported) with the browser packages replaced by fakes.
async function loadRenderer(env: Partial<Record<(typeof ENV_KEYS)[number], string>>, page: FakePage = fakePage()) {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const context = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  const browser = {
    on: vi.fn(),
    close: vi.fn(async () => {}),
    newPage: vi.fn(async () => page),
    createBrowserContext: vi.fn(async () => context),
  };
  const launchCore = vi.fn(async () => browser); // puppeteer-core, used with @sparticuz/chromium on serverless
  const launchFull = vi.fn(async () => browser); // puppeteer, used locally
  vi.doMock("puppeteer-core", () => ({ launch: launchCore }));
  vi.doMock("puppeteer", () => ({ launch: launchFull }));
  vi.doMock("@sparticuz/chromium", () => ({
    default: { args: CHROMIUM_ARGS, executablePath: vi.fn(async () => "/tmp/chromium") },
  }));
  const renderer = await import("@/lib/pdf/render");
  return { ...renderer, page, browser, context, launchCore, launchFull };
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.doUnmock("puppeteer-core");
  vi.doUnmock("puppeteer");
  vi.doUnmock("@sparticuz/chromium");
  vi.resetModules();
});

const SERVERLESS = [
  ["VERCEL", { VERCEL: "1" }],
  ["AWS_LAMBDA_FUNCTION_NAME", { AWS_LAMBDA_FUNCTION_NAME: "render" }],
] as const;

describe("renderer on serverless (single-process Chromium)", () => {
  it.each(SERVERLESS)("%s: opens the page in the default context and never creates a browser context", async (_name, env) => {
    const r = await loadRenderer(env);
    const pdf = await r.renderHtmlToPdf("<p>x</p>", "<span></span>");

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(r.browser.createBrowserContext).not.toHaveBeenCalled();
    expect(r.context.newPage).not.toHaveBeenCalled();
    expect(r.browser.newPage).toHaveBeenCalledTimes(1);
    expect(r.page.close).toHaveBeenCalledTimes(1);
  });

  it("launches puppeteer-core with exactly the flags and executable @sparticuz/chromium supplies", async () => {
    const r = await loadRenderer({ VERCEL: "1" });
    await r.renderHtmlToPdf("<p>x</p>", "");

    expect(r.launchCore).toHaveBeenCalledTimes(1);
    expect(r.launchCore).toHaveBeenCalledWith({ args: CHROMIUM_ARGS, executablePath: "/tmp/chromium", headless: true });
    expect(r.launchFull).not.toHaveBeenCalled();
  });

  it("reuses one browser across renders, with a fresh page each time", async () => {
    const r = await loadRenderer({ VERCEL: "1" });
    await r.renderHtmlToPdf("<p>1</p>", "");
    await r.renderHtmlToPdf("<p>2</p>", "");

    expect(r.launchCore).toHaveBeenCalledTimes(1);
    expect(r.browser.newPage).toHaveBeenCalledTimes(2);
    expect(r.page.close).toHaveBeenCalledTimes(2);
  });

  it("still closes the page when the browser dies mid-print, and surfaces the error", async () => {
    const page = fakePage({ pdf: async () => Promise.reject(new Error("browser died")) });
    const r = await loadRenderer({ VERCEL: "1" }, page);

    await expect(r.renderHtmlToPdf("<p>x</p>", "")).rejects.toThrow("browser died");
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure to open the page without trying to close one", async () => {
    const r = await loadRenderer({ VERCEL: "1" });
    r.browser.newPage.mockRejectedValueOnce(new Error("Protocol error (Target.createTarget): Target closed"));

    await expect(r.renderHtmlToPdf("<p>x</p>", "")).rejects.toThrow("Target closed");
    expect(r.page.close).not.toHaveBeenCalled();
  });
});

describe("renderer locally (multi-process puppeteer)", () => {
  it("isolates every render in its own browser context and closes it", async () => {
    const r = await loadRenderer({});
    await r.renderHtmlToPdf("<p>x</p>", "");

    expect(r.browser.createBrowserContext).toHaveBeenCalledTimes(1);
    expect(r.context.newPage).toHaveBeenCalledTimes(1);
    expect(r.browser.newPage).not.toHaveBeenCalled();
    expect(r.context.close).toHaveBeenCalledTimes(1);
  });

  it("launches the full puppeteer with only headless: true", async () => {
    const r = await loadRenderer({});
    await r.renderHtmlToPdf("<p>x</p>", "");

    expect(r.launchFull).toHaveBeenCalledWith({ headless: true });
    expect(r.launchCore).not.toHaveBeenCalled();
  });

  it("still closes the context when printing fails", async () => {
    const page = fakePage({ pdf: async () => Promise.reject(new Error("print failed")) });
    const r = await loadRenderer({}, page);

    await expect(r.renderHtmlToPdf("<p>x</p>", "")).rejects.toThrow("print failed");
    expect(r.context.close).toHaveBeenCalledTimes(1);
  });
});

// The lockdown must not depend on which page-opening path is in use.
describe.each([
  ["serverless", { VERCEL: "1" }],
  ["local", {}],
] as const)("renderer lockdown (%s)", (_label, env) => {
  it("keeps JavaScript off and request interception on", async () => {
    const r = await loadRenderer(env);
    await r.renderHtmlToPdf("<p>x</p>", "");

    expect(r.page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(r.page.setRequestInterception).toHaveBeenCalledWith(true);
  });

  it("aborts every request except the document itself", async () => {
    const r = await loadRenderer(env);
    await r.renderHtmlToPdf("<p>x</p>", "");
    const onRequest = r.page.handlers.get("request")?.[0] as (request: FakeRequest) => void;
    expect(onRequest).toBeTypeOf("function");

    const hostile = [
      "http://example.test/pixel.png",
      "https://example.test/",
      "file:///etc/passwd",
      "ftp://example.test/x",
      "ws://example.test/socket",
      "chrome://version",
      "blob:https://example.test/abc",
      "javascript:alert(1)",
    ];
    for (const url of hostile) {
      const request = fakeRequest(url);
      onRequest(request);
      expect(request.abort, url).toHaveBeenCalledWith("blockedbyclient");
      expect(request.continue, url).not.toHaveBeenCalled();
    }
    for (const url of ["about:blank", "data:text/html,hello"]) {
      const request = fakeRequest(url);
      onRequest(request);
      expect(request.continue, url).toHaveBeenCalled();
      expect(request.abort, url).not.toHaveBeenCalled();
    }
  });

  it("refuses to produce a PDF when the page navigates away while printing", async () => {
    const page = fakePage({
      pdf: async (p) => {
        emit(p, "framenavigated", p.frame);
        return PDF_BYTES;
      },
    });
    const r = await loadRenderer(env, page);

    await expect(r.renderHtmlToPdf("<p>x</p>", "")).rejects.toBeInstanceOf(r.RenderIntegrityError);
  });

  it("ignores navigations of other frames", async () => {
    const page = fakePage({
      pdf: async (p) => {
        emit(p, "framenavigated", { name: "an iframe" });
        return PDF_BYTES;
      },
    });
    const r = await loadRenderer(env, page);

    await expect(r.renderHtmlToPdf("<p>x</p>", "")).resolves.toBeInstanceOf(Buffer);
  });

  it("refuses to produce a PDF when the page is no longer the document that was set", async () => {
    const page = fakePage();
    page.url.mockReturnValue("chrome-error://chromewebdata/");
    const r = await loadRenderer(env, page);
    await expect(r.renderHtmlToPdf("<p>x</p>", "")).rejects.toBeInstanceOf(r.RenderIntegrityError);
  });

  it("refuses to produce a PDF when the render sentinel is missing", async () => {
    const page = fakePage();
    page.$.mockResolvedValue(null);
    const r = await loadRenderer(env, page);
    await expect(r.renderHtmlToPdf("<p>x</p>", "")).rejects.toBeInstanceOf(r.RenderIntegrityError);
    expect(page.pdf).not.toHaveBeenCalled();
  });
});
