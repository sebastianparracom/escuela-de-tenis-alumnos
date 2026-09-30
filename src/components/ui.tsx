import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Encabezado grande de pantalla (título + acción opcional). */
export function PageHeader({ eyebrow, title, action, back }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="px-4 pt-4 pb-1">
      {back && (
        <Link href={back.href} className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-0.5 pr-2 text-[15px] font-medium text-brand">
          <Icon name="left" size={20} strokeWidth={2} />
          {back.label}
        </Link>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-[13px] font-semibold text-muted">{eyebrow}</div>}
          <h1 className="mt-0.5 text-[30px] leading-tight font-bold tracking-[-0.03em] text-balance">{title}</h1>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({ children, tone = "muted", aside }: { children: ReactNode; tone?: "muted" | "danger"; aside?: ReactNode }) {
  return (
    <div className={cx("flex items-baseline justify-between px-7 pt-5 pb-1.5 text-xs font-semibold tracking-[0.04em] uppercase", tone === "danger" ? "text-danger" : "text-muted")}>
      <h2>{children}</h2>
      {aside && <span className="font-mono normal-case tracking-normal">{aside}</span>}
    </div>
  );
}

/** Tarjeta blanca con filas separadas por líneas (lista agrupada). */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-4 overflow-hidden rounded-[14px] border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line-soft", className)}>{children}</div>;
}

export function Row({
  href,
  title,
  subtitle,
  leading,
  trailing,
  chevron,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
}) {
  const body = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      {trailing}
      {(chevron ?? Boolean(href)) && <Icon name="right" size={16} strokeWidth={2} className="shrink-0 text-faint" />}
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 px-3.5 py-2";
  return href ? (
    <Link href={href} className={cx(cls, "active:bg-bg")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function TimeBlock({ top, bottom }: { top: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="w-[62px] shrink-0 font-mono text-xs leading-tight whitespace-nowrap text-ink-2">
      <div className={bottom ? "" : "text-sm font-semibold text-ink"}>{top}</div>
      {bottom && <div className="text-sm font-semibold text-ink">{bottom}</div>}
    </div>
  );
}

type Tone = "green" | "blue" | "amber" | "red" | "gray";
const TONES: Record<Tone, string> = {
  green: "bg-brand-soft text-brand-dark",
  blue: "bg-info-soft text-info-ink",
  amber: "bg-[#fdf1d8] text-[#6b4700]",
  red: "bg-danger-soft text-danger",
  gray: "bg-field text-ink-2",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-[11px] font-semibold whitespace-nowrap", TONES[tone])}>{children}</span>;
}

const BTN = {
  primary: "bg-brand text-white active:bg-brand-dark disabled:opacity-60",
  secondary: "border border-line bg-surface text-ink active:bg-bg disabled:opacity-60",
  danger: "bg-danger text-white disabled:opacity-60",
  ghost: "text-brand active:bg-brand-soft",
};

export function buttonClass(variant: keyof typeof BTN = "primary", size: "md" | "lg" | "sm" = "md", full = false) {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
    size === "lg" ? "h-[50px] px-5 text-base" : size === "sm" ? "h-9 px-3 text-[13px]" : "h-11 px-4 text-sm",
    full && "w-full",
    BTN[variant],
  );
}

export function LinkButton({ href, variant, size, full, icon, children }: { href: string; variant?: keyof typeof BTN; size?: "md" | "lg" | "sm"; full?: boolean; icon?: IconName; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, full)}>
      {icon && <Icon name={icon} size={18} strokeWidth={2.2} />}
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

export function Notice({ tone = "gray", children }: { tone?: "gray" | "red" | "green"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "mx-4 rounded-xl px-3.5 py-3 text-[13px] leading-snug",
        tone === "red" ? "bg-danger-soft text-danger" : tone === "green" ? "bg-brand-soft text-brand-dark" : "bg-field text-ink-2",
      )}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "block h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-bg";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select {...props} className={cx(inputClass, "appearance-none pr-10", props.className)} />
      <Icon name="down" size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputClass, "h-auto min-h-24 py-3", props.className)} />;
}

export function FormCard({ children }: { children: ReactNode }) {
  return <div className="mx-4 space-y-4 rounded-[14px] border border-line bg-surface p-4">{children}</div>;
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

export function Avatar({ name, src, size = 38 }: { name: string; src?: string | null; size?: number }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-field text-[13px] font-bold text-ink-2" style={{ width: size, height: size }}>
      {ini}
    </span>
  );
}
