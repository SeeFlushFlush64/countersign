import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// PDF bytes are omitted from every query by default. A list or detail query
// therefore never loads a PDF; code that needs the bytes (the artifact
// loaders in src/lib/documents.ts) must select `pdfData` explicitly.
const OMIT_PDF_BYTES = {
  document: { pdfData: true },
  documentArtifact: { pdfData: true },
} as const;

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter, omit: OMIT_PDF_BYTES });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
