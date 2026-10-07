import type { LucideIcon } from "lucide-react";

// What a list shows when it is empty: what belongs here, and how something
// gets here. No illustration.
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-12 sm:px-5">
      <Icon aria-hidden className="size-5 text-slate" />
      <div>
        <p className="text-[15px] font-medium text-paper">{title}</p>
        {children && <p className="mt-1 max-w-md text-sm text-slate">{children}</p>}
      </div>
      {action}
    </div>
  );
}
