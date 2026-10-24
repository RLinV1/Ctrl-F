"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useState } from "react";
import FlowField from "@/components/kokonutui/flow-field";
import { cn } from "@/lib/utils";
import { DeviceStatusPanel } from "./device-status";
import { Mark } from "./mark";

const NAV = [
  { href: "/", label: "Ask" },
  { href: "/items", label: "Items" },
  { href: "/history", label: "History" },
] as const;

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map((item) => (
        <li key={item.href}>
          <Link
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "block px-3 py-2 text-[15px] transition-colors duration-150",
              isActive(pathname, item.href)
                ? "bg-sidebar-accent font-semibold text-ink"
                : "text-ink-muted hover:bg-sidebar-accent/60 hover:text-ink",
            )}
            href={item.href}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Reads the path at request time, so it sits inside Suspense; the fallback has no highlight. */
function ActiveNavLinks({ onNavigate }: { onNavigate: () => void }) {
  return <NavLinks onNavigate={onNavigate} pathname={usePathname()} />;
}

/*
 * Shell from the dealt style (tinted frame, white sheet): a 228px sidebar on the
 * paper ground, and the page on a lighter sheet inset 8px from the window's top,
 * right and bottom, with a 1px edge and no shadow. On a phone the frame goes and
 * a 48px bar holds the menu, the name and nothing else.
 */
export function Shell({ children, signOut }: { children: ReactNode; signOut: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const nav = (
    <nav aria-label="Main" className="mt-8">
      <Suspense fallback={<NavLinks onNavigate={close} pathname={null} />}>
        <ActiveNavLinks onNavigate={close} />
      </Suspense>
    </nav>
  );

  const brand = (
    <Link className="flex items-center gap-2.5" href="/" onClick={close}>
      <Mark className="size-8" />
      <span className="font-heading font-bold text-[22px] leading-none">Ctrl-F</span>
    </Link>
  );

  const footer = (
    <div className="mt-auto space-y-6">
      <DeviceStatusPanel />
      {signOut && (
        <form action="/api/session" method="post">
          <input name="intent" type="hidden" value="sign-out" />
          <button className="text-ink-muted text-sm underline-offset-4 hover:text-ink hover:underline" type="submit">
            Sign out
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="relative isolate min-h-dvh bg-paper md:flex">
      {/* Brass streams drifting behind the frame, like steam through the works. Fixed to the
          window; still under reduced motion. The sheet lets them show faintly between panels. */}
      <FlowField className="fixed -z-10 text-brass/75" density={1} speed={0.55} />
      <aside className="hidden w-[228px] shrink-0 flex-col px-5 py-6 md:flex md:sticky md:top-0 md:h-dvh">
        {brand}
        {nav}
        {footer}
      </aside>

      <header className="sticky top-0 z-20 flex h-12 items-center justify-between bg-paper/90 px-4 md:hidden">
        {brand}
        <button
          aria-controls="mobile-menu"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-10 items-center justify-center"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-12 bottom-0 z-20 flex flex-col bg-paper px-5 pb-8 md:hidden" id="mobile-menu">
          {nav}
          {footer}
        </div>
      )}

      <main className="min-w-0 flex-1 border-rule bg-sheet/55 md:my-2 md:mr-2 md:border md:min-h-[calc(100dvh-16px)]">
        {children}
      </main>
    </div>
  );
}
