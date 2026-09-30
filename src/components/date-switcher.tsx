"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Icon } from "./icons";

/** Selector de fecha de la propuesta B: flechas a los lados y la fecha al centro, que abre un calendario. */
export function DateSwitcher({ date, label, isToday, prev, next }: { date: string; label: string; isToday: boolean; prev: string; next: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const href = (d: string) => {
    const p = new URLSearchParams(params);
    p.set("fecha", d);
    return `${path}?${p}`;
  };
  return (
    <div className="mx-4 mt-3 flex items-center justify-between rounded-[14px] border border-line bg-surface p-1">
      <Link href={href(prev)} aria-label="Día anterior" className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-bg">
        <Icon name="left" size={22} strokeWidth={2} />
      </Link>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => input.current?.showPicker?.() ?? input.current?.focus()}
        className="relative flex min-h-12 flex-col items-center justify-center px-3"
      >
        <span className="text-[11px] font-semibold tracking-[0.06em] text-brand uppercase">{isToday ? "Hoy" : "Ver otro día"}</span>
        <span className="text-lg font-bold tracking-[-0.01em]">{label}</span>
        <input
          ref={input}
          type="date"
          value={date}
          aria-label="Elegir fecha"
          onChange={(e) => e.target.value && router.push(href(e.target.value))}
          className="pointer-events-none absolute inset-0 opacity-0"
          tabIndex={-1}
        />
      </button>
      <Link href={href(next)} aria-label="Día siguiente" className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-bg">
        <Icon name="right" size={22} strokeWidth={2} />
      </Link>
    </div>
  );
}
