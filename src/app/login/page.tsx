import { LoginForm } from "./LoginForm";
import { StatusStrip } from "@/components/StatusStrip";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <StatusStrip segments={["COUNTERSIGN", "INTERNAL LOGIN"]} />

      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
        Sign in
      </h1>
      <p className="mt-2 text-sm text-slate">
        This login gates the internal app only &mdash; recipients signing a
        document never need an account.
      </p>

      <div className="mt-8 rounded-lg border border-panel-border bg-panel p-6">
        <LoginForm redirectTo={callbackUrl || "/"} />
      </div>
    </main>
  );
}
