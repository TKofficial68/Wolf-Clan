"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, House, ListChecks, UserRound, UsersRound } from "lucide-react";
import { useApp } from "./providers";
import type { MessageKey } from "@/i18n";

const items: { href: string; label: MessageKey; icon: typeof House; matches: string[] }[] = [
  { href: "/home", label: "nav.home", icon: House, matches: ["/home", "/announcements", "/chat"] },
  { href: "/groups", label: "nav.group", icon: UsersRound, matches: ["/groups"] },
  { href: "/reviews", label: "nav.reviews", icon: Clapperboard, matches: ["/reviews"] },
  { href: "/tasks", label: "nav.tasks", icon: ListChecks, matches: ["/tasks"] },
  { href: "/profile", label: "nav.profile", icon: UserRound, matches: ["/profile", "/u/", "/settings", "/menu"] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useApp();

  return (
    <nav className="nav-wrap chrome" aria-label="Main">
      <div className="nav-shell">
        <div className="nav-inner">
          {items.map((item) => {
            const active = item.matches.some((path) => pathname === path || pathname.startsWith(path));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="nav-item" data-active={active} aria-current={active ? "page" : undefined}>
                <span className="nav-ring">
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="leading-none">{t(item.label)}</span>
                <span className="nav-underline" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
