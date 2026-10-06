import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { RENDER_SENTINEL_ID, renderDocumentHtml, renderFooterHtml } from "@/lib/pdf/template";
import { RenderIntegrityError, renderHtmlToPdf } from "@/lib/pdf/render";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { makeAgreement, makeCompany } from "./helpers/agreements";

// Audit finding C2 (Critical): a counterparty name containing <script> ran
// inside server-side Chromium, and injected HTML made it fetch internal URLs
// (SSRF, potentially full-read via frames printed into the PDF). Two
// independent layers now stop this: every merge field is HTML-escaped, and the
// renderer disables JavaScript and blocks every network request.

const hits: string[] = [];
const server = http.createServer((req, res) => {
  hits.push(req.url ?? "");
  res.end("x");
});
let base = "";

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  hits.length = 0;
});

// Short enough to pass the input length limits (title 200, name 120), so it
// reaches the renderer through the real lifecycle.
const compactPayload = () =>
  `Evil <img src="${base}/img"><script>new Image().src="${base}/js"</script>`;

const payload = () =>
  `Evil Co <img src="${base}/img"><script>new Image().src="${base}/js"</script>` +
  `<iframe src="${base}/frame"></iframe><meta http-equiv="refresh" content="0;url=${base}/meta">`;

describe("template escaping", () => {
  it("escapes every user-controlled merge field, including the footer", () => {
    const evil = payload();
    const data = {
      documentId: `id"><b>`,
      documentTitle: evil,
      templateType: "NDA" as const,
      effectiveDate: "January 1, 2026",
      companyName: "Northlight Media Group",
      companyAddress: "44 Cannery Row",
      counterpartyName: evil,
      counterpartyEmail: `x@y.example"><img src=${base}/email>`,
      countersignerName: evil,
      countersignerRole: "General Counsel",
    };
    const html = renderDocumentHtml(data) + renderFooterHtml(data);

    expect(html).not.toContain("<script>new Image");
    expect(html).not.toContain(`<img src="${base}`);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain('<meta http-equiv="refresh"');
    expect(html).not.toContain('id"><b>');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderer lockdown (independent of escaping)", () => {
  it("makes no network request and runs no script, whatever the HTML contains", async () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="${base}/link">
      <style>@import url("${base}/import"); body{background:url("${base}/bg")}
        @font-face{font-family:x;src:url("${base}/font")} p{font-family:x}</style></head>
      <body><p>body text</p>
      <img src="${base}/img"><iframe src="${base}/frame"></iframe>
      <object data="${base}/object"></object><video poster="${base}/poster"></video>
      <iframe src="file:///C:/Windows/win.ini"></iframe><img src="file:///etc/passwd">
      <script>fetch("${base}/fetch"); new Image().src = "${base}/script";</script>
      <div id="${RENDER_SENTINEL_ID}"></div></body></html>`;

    const pdf = await renderHtmlToPdf(html, `<span><img src="${base}/footer"></span>`);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(hits).toEqual([]);
  });

  it("refuses to produce a PDF when the page navigates away (blank-PDF guard)", async () => {
    const html = `<!doctype html><html><head>
      <meta http-equiv="refresh" content="0;url=${base}/meta"></head>
      <body><div id="${RENDER_SENTINEL_ID}"></div></body></html>`;
    await expect(
      renderHtmlToPdf(html, ""),
    ).rejects.toBeInstanceOf(RenderIntegrityError);
    expect(hits).toEqual([]);
  });
});

describe("end to end through the lifecycle", () => {
  it("creates, freezes and executes an agreement with hostile names without any fetch", async () => {
    const company = await makeCompany();
    await prisma.sender.update({
      where: { id: company.signatory.senderId },
      data: { name: payload() },
    });
    const a = await makeAgreement(company, "executed", {
      title: compactPayload(),
      counterpartyName: compactPayload(),
    });

    expect(hits).toEqual([]);
    const artifacts = await prisma.documentArtifact.findMany({ where: { documentId: a.id } });
    expect(artifacts.map((x) => [x.kind, x.status]).sort()).toEqual([
      ["EXECUTED", "READY"],
      ["FROZEN", "READY"],
      ["PREVIEW", "READY"],
    ]);
  });
});
