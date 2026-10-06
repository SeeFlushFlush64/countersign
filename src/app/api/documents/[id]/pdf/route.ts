import { NextResponse } from "next/server";
import { loadAgreementPdf } from "@/lib/documents";

// Serves the executed PDF if it is READY, otherwise the frozen copy, otherwise
// the draft preview. (Access control for this route is Phase C.)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await loadAgreementPdf(id);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ("pending" in result) {
    return NextResponse.json(
      { error: "The executed PDF is not ready yet. Try again shortly." },
      { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.title.replace(/[^a-z0-9-_ ]/gi, "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
