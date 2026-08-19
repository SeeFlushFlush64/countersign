import { auth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar
        senderName={session?.user.senderName ?? ""}
        senderRole={session?.user.senderRole ?? ""}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
