"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle, PenLine } from "lucide-react";
import { SignatureField, type SignatureFieldHandle } from "@/components/signing/SignatureField";
import { buttonClasses } from "@/components/ui/button";

// The countersignature: draw or type, read the consequence, sign. The
// server action is already bound to the agreement and to the frozen
// document's fingerprint this page showed; it only receives the signature.
// On phones the submit button is pinned to the bottom of the screen.
export function CountersignForm({
  signerName,
  counterpartyName,
  action,
}: {
  signerName: string;
  counterpartyName: string;
  action: (signature: string) => Promise<{ error: string | null } | void>;
}) {
  const field = useRef<SignatureFieldHandle>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const signature = await field.current?.toPng();
    if (!signature) {
      setError("Add your signature first: draw it, or type your name.");
      return;
    }
    startTransition(async () => {
      const result = await action(signature);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <SignatureField ref={field} signerName={signerName} onReadyChange={setReady} disabled={pending} />

      <p className="text-[13px] text-slate">
        By countersigning, you sign this agreement electronically as {signerName}, after {counterpartyName}, and it
        is executed immediately. This cannot be undone.
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-panel-border bg-ink/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <button
          type="submit"
          disabled={pending || !ready}
          className={buttonClasses("primary", "md", "w-full")}
        >
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <PenLine aria-hidden />}
          {pending ? "Executing…" : "Countersign and execute"}
        </button>
      </div>
    </form>
  );
}
