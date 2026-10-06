import Handlebars from "handlebars";
import { TEMPLATE_CONTENT } from "./content";
import type { TemplateType } from "@/generated/prisma/enums";

// Everything here except the template text itself is untrusted (names,
// titles and emails are typed by users), so every merge field is
// HTML-escaped. The agreement body carries no signatures: it is rendered once
// and frozen at send, and signatures are stamped onto an execution page with
// pdf-lib afterwards (src/lib/pdf/execution-page.ts).
export type DocumentPdfData = {
  documentId: string;
  documentTitle: string;
  templateType: TemplateType;
  effectiveDate: string;
  companyName: string;
  companyAddress: string;
  counterpartyName: string;
  counterpartyEmail: string;
  countersignerName: string;
  countersignerRole: string;
};

// The renderer refuses to produce a PDF unless this element is present in
// the loaded page, so a page that navigated away (e.g. to an error page)
// can never be frozen as the agreement.
export const RENDER_SENTINEL_ID = "countersign-render-sentinel";

const SHELL = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: letter; margin: 0.9in 0.85in 1in 0.85in; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 11.5pt;
    line-height: 1.5;
    color: #16181c;
    margin: 0;
  }
  .letterhead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1.5pt solid #16181c;
    padding-bottom: 8pt;
    margin-bottom: 20pt;
  }
  .letterhead .company {
    font-family: Helvetica, Arial, sans-serif;
    font-weight: 700;
    font-size: 11pt;
    letter-spacing: 0.02em;
  }
  .letterhead .meta {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 8.5pt;
    color: #555;
    text-align: right;
  }
  h1 {
    font-size: 15pt;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 18pt 0;
  }
  .recital {
    text-align: justify;
    margin-bottom: 16pt;
  }
  .clause { margin-bottom: 11pt; text-align: justify; }
  .clause h2 {
    font-size: 11.5pt;
    font-weight: 700;
    display: inline;
  }
  .clause .body { display: inline; }
  .execution {
    margin-top: 28pt;
    padding-top: 10pt;
    border-top: 1pt solid #16181c;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9pt;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .execution h2 { font-size: 10pt; margin: 0 0 6pt 0; }
  .execution p { margin: 0 0 8pt 0; color: #333; }
  .parties { display: flex; gap: 36pt; }
  .party { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .party .role { color: #555; }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="company">{{companyName}}</div>
    <div class="meta">{{companyAddress}}</div>
  </div>

  <h1>{{templateLabel}}</h1>

  <div class="recital">{{{recital}}}</div>

  {{#each clauses}}
  <div class="clause">
    <h2>{{this.heading}}</h2>
    <span class="body">&nbsp;{{{this.body}}}</span>
  </div>
  {{/each}}

  <div class="execution">
    <h2>Execution</h2>
    <p>
      This Agreement is executed by electronic signature, the Counterparty
      signing first and the Company countersigning second. The execution page
      appended to this document records each signature, the time it was made,
      and the SHA-256 fingerprint of this document as sent.
    </p>
    <div class="parties">
      <div class="party">
        {{countersignerName}}<br />
        <span class="role">{{countersignerRole}}, {{companyName}}</span>
      </div>
      <div class="party">
        {{counterpartyName}}<br />
        <span class="role">{{counterpartyEmail}}</span>
      </div>
    </div>
  </div>

  <div id="${RENDER_SENTINEL_ID}"></div>
</body>
</html>`;

// Default Handlebars escaping applies to the merged values only; the
// template text (with its HTML entities) is trusted, authored content.
const compiled = Handlebars.compile(SHELL, { strict: true });

export function renderDocumentHtml(data: DocumentPdfData): string {
  const content = TEMPLATE_CONTENT[data.templateType];

  const recital = Handlebars.compile(content.recital, { strict: true })(data);
  const clauses = content.clauses.map((clause) => ({
    heading: clause.heading,
    body: Handlebars.compile(clause.body, { strict: true })(data),
  }));

  return compiled({
    ...data,
    templateLabel: content.label,
    // Already escaped above; inserted with triple braces in SHELL.
    recital,
    clauses,
  });
}

export function renderFooterHtml(data: DocumentPdfData): string {
  // Puppeteer renders this as its own isolated document per page, styled
  // independently of the main page CSS — font sizes here are plain px.
  const title = Handlebars.escapeExpression(data.documentTitle);
  const ref = Handlebars.escapeExpression(data.documentId);
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#888;width:100%;text-align:center;">
    ${title} &middot; Ref ${ref} &middot; Generated by Countersign (demo)
  </div>`;
}
