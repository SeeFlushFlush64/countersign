import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    select: { pdfData: true, title: true },
  });

  if (!document?.pdfData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(document.pdfData), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document.title.replace(/[^a-z0-9-_ ]/gi, "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
