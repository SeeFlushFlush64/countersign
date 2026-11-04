"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { openSampleWorkspace } from "@/app/login/actions";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

// One click into the signed-in sample workspace. The sign-in itself happens on
// the server (openSampleWorkspace); nothing secret is in the page.

function Submit({ variant, size, className }: { variant: ButtonVariant; size: ButtonSize; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses(variant, size, className)}>
      {pending ? "Opening…" : "Open sample workspace"}
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <ArrowRight aria-hidden />}
    </button>
  );
}

export function SampleWorkspaceButton({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <form action={openSampleWorkspace}>
      <Submit variant={variant} size={size} className={className} />
    </form>
  );
}
