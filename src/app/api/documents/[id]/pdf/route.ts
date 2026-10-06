import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadAgreementPdf } from "@/lib/documents";

// Company access to an agreement's PDF: executed if READY, otherwise the
// frozen copy; an agreement never sent shows its draft preview. A derived
// PDF that is not READY is generated again here (idempotent) before 503. Requires a signed-in company
// user, checked here rather than left to the proxy. Counterparties use their
// link-scoped route (/s/[token]/document) instead.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } })
    : null;
  if (!user) {
    return NextResponse.json({ error: "Sign in to view this agreement." }, { status: 401 });
  }

  const { id } = await params;
  const result = await loadAgreementPdf(id);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ("pending" in result) {
    return NextResponse.json(
      { error: "This PDF is not ready yet. Try again shortly." },
      { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.title.replace(/[^a-z0-9-_ ]/gi, "")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
