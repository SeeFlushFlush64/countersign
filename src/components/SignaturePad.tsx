"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import SignaturePadLib from "signature_pad";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
};

export const SignaturePad = forwardRef<SignaturePadHandle, {
  onChange?: (isEmpty: boolean) => void;
}>(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      // Resizing the canvas element clears its bitmap, so preserve any
      // strokes already drawn (e.g. a mobile on-screen keyboard toggling
      // resizes the viewport mid-signature) and redraw them after.
      const savedStrokes = padRef.current?.toData();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
      if (savedStrokes?.length) {
        padRef.current?.fromData(savedStrokes);
      }
    };

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgba(0,0,0,0)",
      penColor: "#0c1116",
      minWidth: 1,
      maxWidth: 2.4,
    });
    padRef.current = pad;

    const handleEnd = () => {
      const isEmpty = pad.isEmpty();
      setEmpty(isEmpty);
      onChange?.(isEmpty);
    };
    pad.addEventListener("endStroke", handleEnd);

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.removeEventListener("endStroke", handleEnd);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      padRef.current?.clear();
      setEmpty(true);
      onChange?.(true);
    },
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
  }));

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border border-panel-border bg-paper"
      />
      <div className="pointer-events-none absolute inset-x-4 bottom-3 border-t border-slate-dim/40" />
      {empty && (
        <span className="pointer-events-none absolute bottom-5 left-4 text-sm text-ink/45">Sign here</span>
      )}
    </div>
  );
});
