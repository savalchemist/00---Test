"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ScanSearch, Search, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/participants", label: "Search", icon: Search },
  { href: "/prescreen", label: "Check Profile", icon: ScanSearch },
  { href: "/participants/new", label: "Add Participant", icon: UserPlus },
];

function isActive(pathname: string, href: string) {
  if (href === "/participants") return pathname === "/participants" || /^\/participants\/(?!new)[^/]+/.test(pathname);
  return pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            isActive(pathname, href) && "bg-accent font-medium text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Users className="size-4" />
      </span>
      Participant Hub
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card px-3 py-5 md:flex">
        <Brand />
        <NavLinks />
        <p className="mt-auto px-3 text-xs text-muted-foreground">Internal tool · User Insight Research</p>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:hidden">
        <Brand />
        <button aria-label="Toggle menu" onClick={() => setOpen((o) => !o)} className="rounded-md p-2 hover:bg-accent">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-14 z-30 border-b bg-card p-3 shadow-sm md:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      )}

      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
