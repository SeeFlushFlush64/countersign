import { globSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// The matcher (and options) Next applies to outputFileTracingIncludes keys,
// in next/dist/build/collect-build-traces.js. It ships without types.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (
  glob: string,
  options: { dot: boolean; contains: boolean },
) => (route: string) => boolean;

// On Vercel, PDFs render with @sparticuz/chromium, which unpacks the browser
// from the archives in its bin/ directory, found at runtime by path. File
// tracing cannot see that, so next.config.ts adds them to the server traces;
// without them every render (send, preview, signing, the demo reset) fails
// in production only. Locally and in CI the full puppeteer is used instead,
// so nothing else would notice.

const BIN_DIR = "node_modules/@sparticuz/chromium/bin";

// Routes whose server code renders PDFs.
const RENDERING_ROUTES = [
  "/agreements/new",
  "/agreements/[id]",
  "/agreements/[id]/countersign",
  "/api/documents/[id]/pdf",
  "/s/[token]",
  "/s/[token]/document",
  "/demo/preparing",
];

function tracedIncludes(route: string): string[] {
  const includes = nextConfig.outputFileTracingIncludes ?? {};
  return Object.entries(includes)
    .filter(([routeGlob]) => picomatch(routeGlob, { dot: true, contains: true })(route))
    .flatMap(([, globs]) => globs);
}

describe("Chromium packaging for serverless rendering", () => {
  const binaries = readdirSync(BIN_DIR)
    .filter((name) => statSync(path.join(BIN_DIR, name)).isFile())
    .map((name) => `${BIN_DIR}/${name}`);

  it("the package still ships the browser archives where the config points", () => {
    expect(binaries).toContain(`${BIN_DIR}/chromium.br`);
  });

  it.each(RENDERING_ROUTES)("%s ships every Chromium archive", (route) => {
    const traced = new Set(
      tracedIncludes(route).flatMap((pattern) =>
        globSync(pattern.replace(/^\.\//, "")).map((file) => file.split(path.sep).join("/")),
      ),
    );
    for (const binary of binaries) expect(traced, `${route} is missing ${binary}`).toContain(binary);
  });
});
