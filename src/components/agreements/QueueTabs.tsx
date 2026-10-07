"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { QUEUE_VIEWS, VIEW_LABELS, type QueueView } from "@/lib/queue";

// View switcher: plain links in one row. When they do not all fit (phones,
// tablets), the row scrolls sideways — and says so: the edge that hides
// more views fades and gets a scroll button, and the active view is always
// scrolled into sight.
export function QueueTabs({ active, counts }: { active: QueueView; counts: Record<QueueView, number> }) {
  const scroller = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const update = () =>
      setMore({
        left: nav.scrollLeft > 1,
        right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
      });

    // Bring the active view fully into sight (clear of the edge fade),
    // scrolling no further than needed so its neighbours stay in view.
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (current) {
      const margin = 40;
      const bounds = nav.getBoundingClientRect();
      const tab = current.getBoundingClientRect();
      if (tab.right > bounds.right - margin) nav.scrollLeft += tab.right - (bounds.right - margin);
      else if (tab.left < bounds.left + margin && nav.scrollLeft > 0) {
        nav.scrollLeft -= bounds.left + margin - tab.left;
      }
    }

    const observer = new ResizeObserver(update);
    observer.observe(nav);
    nav.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, [active]);

  const scrollBy = (direction: 1 | -1) =>
    scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.6, behavior: "smooth" });

  // Fade the edge that hides more views, just inside its scroll button.
  const fade = `linear-gradient(to right, ${more.left ? "transparent 2rem, black 3.5rem" : "black, black"}, ${
    more.right ? "black calc(100% - 3.5rem), transparent calc(100% - 2rem)" : "black, black"
  })`;

  return (
    <div className="relative -mx-4 border-b border-panel-border sm:-mx-6 lg:mx-0">
      <nav
        ref={scroller}
        aria-label="Agreement views"
        className="scrollbar-none overflow-x-auto px-4 sm:px-6 lg:px-0"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <ul className="flex min-w-max">
          {QUEUE_VIEWS.map((view) => {
            const isActive = view === active;
            const count = counts[view];
            const urgent = view === "needs-countersign" && count > 0;
            return (
              <li key={view}>
                <Link
                  href={`/agreements?view=${view}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex h-11 items-center gap-1 px-2 text-sm font-medium whitespace-nowrap transition-colors xl:gap-1.5 xl:px-3 ${
                    isActive ? "text-paper" : "text-slate hover:text-paper"
                  }`}
                >
                  {VIEW_LABELS[view]}
                  <span className={`text-xs tabular-nums ${urgent ? "font-semibold text-signal" : "text-slate"}`}>
                    {count}
                  </span>
                  {isActive && (
                    <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal xl:inset-x-3" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Pointer shortcuts only: keyboard and screen-reader users reach every
          view through the links themselves. */}
      {more.left && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => scrollBy(-1)}
          className="absolute inset-y-0 left-0 flex w-8 items-center justify-center bg-ink text-slate hover:text-paper"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {more.right && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => scrollBy(1)}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center bg-ink text-slate hover:text-paper"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}
