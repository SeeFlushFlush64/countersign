import { NextResponse } from "next/server";
import { loadLinkPdf } from "@/lib/documents";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

// Link-scoped PDF: only the agreement this token belongs to, only while the
// link is valid, and only what was sent (frozen) or the executed copy.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await loadLinkPdf(token);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE_HEADERS });
  }
  if ("pending" in result) {
    return NextResponse.json(
      { error: "The executed PDF is not ready yet. Try again shortly." },
      { status: 503, headers: { ...PRIVATE_HEADERS, "Retry-After": "5" } },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${result.title.replace(/[^a-z0-9-_ ]/gi, "")}.pdf`;
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
