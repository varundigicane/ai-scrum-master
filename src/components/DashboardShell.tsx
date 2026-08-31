"use client";

import Link from "next/link";
import { useState } from "react";
import { PoweredByDigicane } from "@/components/PoweredByDigicane";

type NavItem = { key: string; label: string; href: string };

export function DashboardShell({
  brand,
  userLine,
  nav,
  signOutAction,
  children,
}: {
  brand: string;
  userLine: string;
  nav: NavItem[];
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)]/95 backdrop-blur px-3 py-2">
        <button
          type="button"
          className="btn-secondary btn text-sm px-3"
          aria-expanded={open}
          aria-controls="dashboard-drawer"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-teal-700">{brand}</p>
          <p className="text-sm font-semibold">Delivery HQ</p>
        </div>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="dashboard-drawer"
        className={`dashboard-aside border-b md:border-b-0 md:border-r border-[var(--border)] p-4 z-50
          fixed md:static inset-y-0 left-0 w-[min(280px,85vw)] md:w-auto
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          bg-[var(--panel)] md:bg-transparent shadow-lg md:shadow-none`}
      >
        <div className="mb-6 hidden md:block">
          <p className="text-xs uppercase tracking-[0.14em] text-teal-700">{brand}</p>
          <h1 className="text-lg font-semibold mt-1">Delivery HQ</h1>
          <p className="text-xs text-[var(--muted)] mt-1">{userLine}</p>
        </div>
        <p className="text-xs text-[var(--muted)] mb-3 md:hidden">{userLine}</p>
        <nav className="flex flex-col gap-1">
          {nav.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className="nav-link"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form className="mt-6" action={signOutAction}>
          <button className="btn-secondary btn w-full text-sm" type="submit">
            Sign out
          </button>
        </form>
        <PoweredByDigicane className="mt-4 text-center" />
      </aside>
      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}
