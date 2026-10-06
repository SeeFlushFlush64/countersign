import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Every internal page calls this before reading any data. The proxy also
// redirects signed-out visitors, but a matcher is easy to loosen by accident
// (e.g. to make a marketing page public), so pages never rely on it alone.
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, senderId: true, isSignatory: true },
  });
  if (!user) redirect("/login");
  return { session, user };
}
