import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { Role } from "../src/generated/prisma/enums";
import {
  createDocument,
  sendDocument,
  signAsSigner,
} from "../src/lib/documents";

const DEMO_LOGIN_EMAIL = "demo@countersign.dev";
const DEMO_LOGIN_PASSWORD = "countersign-demo";

function scriptSignature(name: string): string {
  const fontSize = 44;
  const width = Math.max(260, name.length * fontSize * 0.62);
  const height = 110;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <text x="8" y="${height - 40}" font-family="Segoe Script, Brush Script MT, cursive" font-size="${fontSize}" fill="#0c1116">${name}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Shifts a document's createdAt/sentAt/completedAt, its status events, and
// its signers' signedAt timestamps back by `daysAgo` (± a little jitter),
// preserving the relative ordering the state machine already produced.
async function backdate(documentId: string, daysAgo: number) {
  const offsetMs =
    daysAgo * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 3_600_000);
  const shift = (d: Date) => new Date(d.getTime() - offsetMs);

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { signers: true, statusEvents: true },
  });

  await prisma.document.update({
    where: { id: documentId },
    data: {
      createdAt: shift(document.createdAt),
      sentAt: document.sentAt ? shift(document.sentAt) : null,
      completedAt: document.completedAt ? shift(document.completedAt) : null,
    },
  });

  for (const signer of document.signers) {
    if (signer.signedAt) {
      await prisma.signer.update({
        where: { id: signer.id },
        data: { signedAt: shift(signer.signedAt) },
      });
    }
  }

  for (const event of document.statusEvents) {
    await prisma.statusEvent.update({
      where: { id: event.id },
      data: { timestamp: shift(event.timestamp) },
    });
  }
}

async function main() {
  console.log("Seeding senders…");

  const [dana, marcus, priya, tomas] = await Promise.all([
    prisma.sender.create({
      data: {
        name: "Dana Whitfield",
        email: "dana.whitfield@northlightmedia.com",
        role: Role.GENERAL_COUNSEL,
      },
    }),
    prisma.sender.create({
      data: {
        name: "Marcus Ilori",
        email: "marcus.ilori@northlightmedia.com",
        role: Role.CONTRACTS_MANAGER,
      },
    }),
    prisma.sender.create({
      data: {
        name: "Priya Anand",
        email: "priya.anand@northlightmedia.com",
        role: Role.BUSINESS_AFFAIRS,
      },
    }),
    prisma.sender.create({
      data: {
        name: "Tomás Reyes",
        email: "tomas.reyes@northlightmedia.com",
        role: Role.PARALEGAL,
      },
    }),
  ]);

  console.log("Seeding demo login…");
  await prisma.user.create({
    data: {
      email: DEMO_LOGIN_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_LOGIN_PASSWORD, 10),
      senderId: dana.id,
    },
  });

  console.log("Seeding documents…");

  // 1. Fully executed NDA
  const doc1 = await createDocument({
    senderId: dana.id,
    templateType: "NDA",
    title: "Mutual NDA — Ashgrove Creative LLC",
    counterpartyName: "Ashgrove Creative LLC",
    counterpartyEmail: "hello@ashgrovecreative.com",
  });
  await sendDocument(doc1.id);
  // Sequential signing: counterparty signs first, company countersigns second.
  const doc1Counterparty = await prisma.signer.findFirstOrThrow({
    where: { documentId: doc1.id, partyRole: "COUNTERPARTY" },
  });
  await signAsSigner(doc1Counterparty.id, scriptSignature(doc1Counterparty.name));
  const doc1Company = await prisma.signer.findFirstOrThrow({
    where: { documentId: doc1.id, partyRole: "COMPANY" },
  });
  await signAsSigner(doc1Company.id, scriptSignature(doc1Company.name));
  await backdate(doc1.id, 11);

  // 2. Partially signed vendor agreement (counterparty signed, company countersignature pending)
  const doc2 = await createDocument({
    senderId: marcus.id,
    templateType: "VENDOR_AGREEMENT",
    title: "Vendor Services Agreement — Petrel Logistics Co.",
    counterpartyName: "Petrel Logistics Co.",
    counterpartyEmail: "contracts@petrellogistics.com",
  });
  await sendDocument(doc2.id);
  const doc2Counterparty = await prisma.signer.findFirstOrThrow({
    where: { documentId: doc2.id, partyRole: "COUNTERPARTY" },
  });
  await signAsSigner(doc2Counterparty.id, scriptSignature(doc2Counterparty.name));
  await backdate(doc2.id, 4);

  // 3. Sent, awaiting both signatures
  const doc3 = await createDocument({
    senderId: priya.id,
    templateType: "MEDIA_RELEASE",
    title: "Media Release — Jordan Vance",
    counterpartyName: "Jordan Vance",
    counterpartyEmail: "jordan.vance@example.com",
  });
  await sendDocument(doc3.id);
  await backdate(doc3.id, 2);

  // 4. Draft, not yet sent
  await createDocument({
    senderId: tomas.id,
    templateType: "LICENSING_ORDER",
    title: "Content Licensing Order — Fenwick Sound Library",
    counterpartyName: "Fenwick Sound Library",
    counterpartyEmail: "licensing@fenwicksound.com",
  }).then((doc) => backdate(doc.id, 0));

  // 5. Fully executed NDA, second sender for variety
  const doc5 = await createDocument({
    senderId: marcus.id,
    templateType: "NDA",
    title: "Mutual NDA — Blackwood Studio Rentals",
    counterpartyName: "Blackwood Studio Rentals",
    counterpartyEmail: "studio@blackwoodrentals.com",
  });
  await sendDocument(doc5.id);
  const doc5Counterparty = await prisma.signer.findFirstOrThrow({
    where: { documentId: doc5.id, partyRole: "COUNTERPARTY" },
  });
  await signAsSigner(doc5Counterparty.id, scriptSignature(doc5Counterparty.name));
  const doc5Company = await prisma.signer.findFirstOrThrow({
    where: { documentId: doc5.id, partyRole: "COMPANY" },
  });
  await signAsSigner(doc5Company.id, scriptSignature(doc5Company.name));
  await backdate(doc5.id, 8);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
