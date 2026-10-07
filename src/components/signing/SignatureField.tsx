"use client";

import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import { PenLine, Type } from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";

// A signature, drawn or typed. Either way the result is a PNG data URL, so
// the server validates both identically (src/lib/signature.ts): a typed name
// is rendered onto a canvas here, in the browser, in the handwriting face the
// root layout provides as --font-signature.

export type SignatureFieldHandle = {
  // The signature as a PNG data URL, or null if nothing has been given.
  toPng: () => Promise<string | null>;
};

type Mode = "draw" | "type";

const MAX_TYPED = 60;
const INK = "#0c1116";

function handwritingFamily(): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-signature").trim();
  return family || "cursive";
}

async function renderTyped(name: string): Promise<string> {
  const size = 72;
  const font = `600 ${size}px ${handwritingFamily()}`;
  await document.fonts.load(font, name);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = font;
  const padding = 24;
  canvas.width = Math.min(2000, Math.ceil(context.measureText(name).width) + padding * 2);
  canvas.height = Math.round(size * 1.6);
  // Resizing resets the context, so set the font again before drawing.
  context.font = font;
  context.fillStyle = INK;
  context.textBaseline = "middle";
  context.fillText(name, padding, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

export const SignatureField = forwardRef<
  SignatureFieldHandle,
  { signerName: string; onReadyChange?: (ready: boolean) => void; disabled?: boolean }
>(function SignatureField({ signerName, onReadyChange, disabled }, ref) {
  const [mode, setMode] = useState<Mode>("draw");
  const [drawn, setDrawn] = useState(false);
  const [typed, setTyped] = useState(signerName);
  const pad = useRef<SignaturePadHandle>(null);
  const typedId = useId();

  const ready = (m: Mode, hasDrawing: boolean, text: string) =>
    m === "draw" ? hasDrawing : text.trim().length >= 2;

  const report = (m: Mode, hasDrawing: boolean, text: string) => onReadyChange?.(ready(m, hasDrawing, text));

  useImperativeHandle(ref, () => ({
    toPng: async () => {
      if (mode === "draw") {
        if (!pad.current || pad.current.isEmpty()) return null;
        return pad.current.toDataURL();
      }
      const text = typed.trim();
      return text.length >= 2 ? renderTyped(text) : null;
    },
  }));

  const choose = (next: Mode) => {
    setMode(next);
    // Switching to Draw shows a fresh, empty pad.
    const hasDrawing = next === "draw" ? false : drawn;
    if (next === "draw") setDrawn(false);
    report(next, hasDrawing, typed);
  };

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-3">
      <legend className="sr-only">Your signature</legend>
      <div role="radiogroup" aria-label="How to sign" className="inline-flex self-start rounded-md border border-panel-border p-0.5">
        {(
          [
            ["draw", "Draw", PenLine],
            ["type", "Type", Type],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => choose(value)}
            className={`inline-flex h-11 items-center gap-1.5 rounded px-4 text-sm font-medium transition-colors lg:h-8 lg:px-3 ${
              mode === value ? "bg-panel-hover text-paper" : "text-slate hover:text-paper"
            }`}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <div>
          <SignaturePad
            ref={pad}
            onChange={(empty) => {
              setDrawn(!empty);
              report("draw", !empty, typed);
            }}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-slate">
            <span>Draw with your finger, mouse or stylus.</span>
            <button
              type="button"
              onClick={() => pad.current?.clear()}
              className="-mr-2 h-11 rounded px-2 text-slate hover:text-paper lg:h-8"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={typedId} className="text-xs text-slate">
            Type your full name
          </label>
          <input
            id={typedId}
            value={typed}
            maxLength={MAX_TYPED}
            autoComplete="name"
            onChange={(event) => {
              setTyped(event.target.value);
              report("type", drawn, event.target.value);
            }}
            className="h-11 rounded-md border border-panel-border bg-ink px-3 text-base text-paper focus:border-signal focus:outline-none lg:h-10 lg:text-sm"
          />
          <div
            aria-hidden
            className="flex h-28 items-center overflow-hidden rounded-md border border-panel-border bg-paper px-5"
          >
            {/* Scales with the screen so the whole name shows, as it will on the agreement. */}
            <span className="truncate font-[family-name:var(--font-signature)] text-[clamp(1.5rem,6.5vw,3rem)] font-semibold text-ink">
              {typed.trim() || " "}
            </span>
          </div>
          <p className="text-xs text-slate">This is how your typed signature will appear on the agreement.</p>
        </div>
      )}
    </fieldset>
  );
});
