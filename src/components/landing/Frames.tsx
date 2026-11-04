import Image from "next/image";
import { CountersignMark } from "@/components/CountersignMark";

// Device frames for real screenshots. The frames are drawn in CSS; the
// pictures inside them are captures of the application itself.

export function BrowserFrame({
  src,
  width,
  height,
  alt,
  priority = false,
  sizes,
  className = "",
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-rule-strong bg-surface shadow-[0_28px_60px_-30px_rgba(16,28,43,0.5)] ${className}`}
    >
      <div aria-hidden className="flex h-10 items-center gap-3 border-b border-rule bg-canvas-sunken px-4">
        <CountersignMark className="size-4 text-accent" />
        <span className="rounded-md border border-rule bg-surface px-3 py-1 text-xs text-muted">Countersign</span>
      </div>
      <Image src={src} width={width} height={height} alt={alt} priority={priority} sizes={sizes} className="block h-auto w-full" />
    </div>
  );
}

export function PhoneFrame({
  src,
  width,
  height,
  alt,
  sizes,
  className = "",
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  sizes: string;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[17.5rem] overflow-hidden rounded-[2.4rem] border-[9px] border-fg bg-fg shadow-[0_28px_60px_-30px_rgba(16,28,43,0.55)] ${className}`}
    >
      <Image src={src} width={width} height={height} alt={alt} sizes={sizes} className="block h-auto w-full rounded-[1.7rem]" />
    </div>
  );
}
