"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, Bell } from "lucide-react";
import { LogoLockup } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui";
import { useAuth } from "./providers";
import { WalletConnectControl } from "./WalletConnectControl";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/#how", label: "How it works" },
    { href: "/#security", label: "Security" },
    { href: "/#x402", label: "Payments" },
  ];
  return (
    <div className="sticky top-0 z-30 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <LogoLockup />
        <div className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium px-3 py-2 text-neutral-900 dark:text-neutral-50">
            Log in
          </Link>
          <Link href="/signup">
            <Button>Get started</Button>
          </Link>
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-neutral-200 dark:border-neutral-800 px-5 py-4 space-y-4">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block text-sm font-medium text-neutral-900 dark:text-neutral-50"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <ThemeToggle />
            <Link href="/login" className="flex-1">
              <Button variant="secondary" className="w-full">Log in</Button>
            </Link>
            <Link href="/signup" className="flex-1">
              <Button className="w-full">Get started</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppNav() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const username = profile?.username ?? "";
  const initials = username?.trim()
    ? username
        .trim()
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "BP";

  return (
    <div className="sticky top-0 z-30 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <LogoLockup size={30} textSize="text-lg" href="/dashboard" />
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <WalletConnectControl compact />
          </div>
          <ThemeToggle />
          <button className="w-9 h-9 rounded-full flex items-center justify-center border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Bell className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-full bg-brand text-neutral-950 flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="hidden sm:block text-xs font-medium px-2 py-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
