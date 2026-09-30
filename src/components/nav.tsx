"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl justify-around px-1 pt-1">
        {items.map((it) => {
          const active = path === it.href || path.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 text-[10px] ${active ? "font-semibold text-brand" : "font-medium text-muted"}`}
            >
              <Icon name={it.icon} size={24} />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
