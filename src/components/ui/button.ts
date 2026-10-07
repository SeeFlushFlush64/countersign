// Shared button styles, usable on <button> and on <Link>/<a> alike.
//
// One primary action per view: `primary` is the filled accent and should
// appear at most once on a screen. Heights meet a 44px touch target below the
// desktop breakpoint and 40px on desktop.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-signal text-ink hover:bg-signal-strong",
  secondary:
    "border border-panel-border bg-panel text-paper hover:border-panel-border-hover hover:bg-panel-hover",
  ghost: "text-slate hover:bg-panel hover:text-paper",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-[13px] lg:h-8",
  md: "h-11 px-4 text-sm lg:h-10",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className = "",
): string {
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
}
