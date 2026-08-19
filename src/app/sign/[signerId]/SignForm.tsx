"use client";

import { useRef, useState, useTransition } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { signAction } from "./actions";

export function SignForm({
  signerId,
  signerName,
}: {
  signerId: string;
  signerName: string;
}) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!padRef.current || padRef.current.isEmpty()) {
      setError("Draw your signature before submitting.");
      return;
    }
    const dataUrl = padRef.current.toDataURL();
    startTransition(async () => {
      const result = await signAction(signerId, dataUrl);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <p className="label-strip mb-2 text-slate">
          Signature &middot; {signerName}
        </p>
        <SignaturePad ref={padRef} onChange={setEmpty} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || empty}
          className="label-strip rounded-md border border-signal bg-signal/10 px-5 py-2.5 text-paper transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Sign & submit"}
        </button>
        <button
          type="button"
          onClick={() => padRef.current?.clear()}
          disabled={pending}
          className="label-strip rounded-md border border-panel-border px-4 py-2.5 text-slate transition-colors hover:border-panel-border-hover hover:text-paper"
        >
          Clear
        </button>
      </div>

      {error && <p className="label-strip text-danger">{error}</p>}
    </form>
  );
}
