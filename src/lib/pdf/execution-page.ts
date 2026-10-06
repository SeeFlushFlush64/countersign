import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { sha256Hex } from "@/lib/hash";

// Builds the executed agreement: the FROZEN PDF's pages, untouched, followed
// by one execution page stamped with both signatures. No browser is involved,
// so execution never depends on Chromium. The output is deterministic for a
// given input (fixed metadata dates), which makes regeneration idempotent:
// a retry produces the same bytes and the same SHA-256.

export type ExecutionParty = {
  name: string;
  detail: string; // email (counterparty) or "Role, Company" (company)
  signedAt: Date;
  signaturePng: Uint8Array;
};

export type ExecutionInput = {
  documentId: string;
  title: string;
  frozenPdf: Uint8Array;
  frozenSha256: string;
  counterparty: ExecutionParty;
  company: ExecutionParty;
  executedAt: Date;
};

const PAGE = { width: 612, height: 792 }; // US Letter, points
const MARGIN = 61;
const INK = rgb(0.086, 0.094, 0.11);
const MUTED = rgb(0.33, 0.33, 0.33);

export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

// The standard PDF fonts only cover WinAnsi; anything else is replaced so a
// name in another script can never make execution fail. (The agreement body
// itself, rendered by Chromium, shows every name in full.)
function encodable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text.replace(/[\r\n\t]+/g, " ")]
    .map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?"))
    .join("");
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number) {
  const words = encodable(font, text).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    // A single word longer than the line is hard-broken.
    while (font.widthOfTextAtSize(line, size) > maxWidth) {
      let cut = line.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -3)}...`;
  }
  return lines;
}

export async function buildExecutedPdf(input: ExecutionInput): Promise<Uint8Array> {
  if (sha256Hex(input.frozenPdf) !== input.frozenSha256) {
    throw new Error("The frozen agreement does not match its recorded SHA-256.");
  }

  const pdf = await PDFDocument.load(input.frozenPdf, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const contentWidth = PAGE.width - MARGIN * 2;

  let y = PAGE.height - MARGIN;
  const text = (value: string, opts: { font?: PDFFont; size?: number; color?: typeof INK; x?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 9;
    page.drawText(encodable(font, value), { x: opts.x ?? MARGIN, y, size, font, color: opts.color ?? INK });
  };

  text("EXECUTION PAGE", { font: bold, size: 13 });
  y -= 20;
  for (const line of wrap(bold, input.title, 11, contentWidth, 3)) {
    text(line, { font: bold, size: 11 });
    y -= 14;
  }
  text(`Agreement reference ${input.documentId}`, { color: MUTED });
  y -= 13;
  text("SHA-256 of the agreement as sent (pages before this one):", { color: MUTED });
  y -= 12;
  text(input.frozenSha256, { font: regular, size: 8.5 });
  y -= 26;

  const block = async (heading: string, verb: string, party: ExecutionParty) => {
    text(heading, { font: bold, size: 10 });
    y -= 10;
    const image = await pdf.embedPng(party.signaturePng);
    const scale = Math.min(220 / image.width, 70 / image.height, 1);
    const height = image.height * scale;
    page.drawImage(image, { x: MARGIN, y: y - height, width: image.width * scale, height });
    y -= Math.max(height, 20) + 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 260, y }, thickness: 0.8, color: INK });
    y -= 13;
    for (const line of wrap(regular, party.name, 10, contentWidth, 2)) {
      text(line, { size: 10 });
      y -= 13;
    }
    for (const line of wrap(regular, party.detail, 9, contentWidth, 2)) {
      text(line, { color: MUTED });
      y -= 12;
    }
    text(`${verb} ${formatUtc(party.signedAt)}`, { color: MUTED });
    y -= 30;
  };

  await block("1. Counterparty signature", "Signed", input.counterparty);
  await block("2. Company countersignature", "Countersigned", input.company);

  for (const line of wrap(
    regular,
    "The counterparty signed first. The company countersignature was accepted only after the " +
      "counterparty's signature had been recorded, and only from the designated, signed-in " +
      "company signatory. Both signatures apply to the document identified by the SHA-256 above.",
    9,
    contentWidth,
    4,
  )) {
    text(line, { color: MUTED });
    y -= 12;
  }

  y = MARGIN;
  text(`Executed ${formatUtc(input.executedAt)} - Generated by Countersign (demo)`, {
    size: 7.5,
    color: MUTED,
  });

  pdf.setTitle(encodable(regular, input.title));
  pdf.setProducer("Countersign");
  pdf.setCreator("Countersign");
  pdf.setCreationDate(input.executedAt);
  pdf.setModificationDate(input.executedAt);

  return pdf.save();
}
