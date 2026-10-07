export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

// "just now", "5 minutes ago", "in 3 days", or a short date once more than a
// week away ("Sep 28", with the year if it differs from now's).
export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 45 * 60) return RELATIVE.format(Math.round(seconds / 60), "minute");
  if (abs < 22 * 3600) return RELATIVE.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return RELATIVE.format(Math.round(seconds / 86400), "day");
  return (date.getFullYear() === now.getFullYear() ? SHORT_DATE : SHORT_DATE_YEAR).format(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
