import Link from "next/link";
import { inputClass } from "@/components/ui";

const ROLES = [
  [null, "Todos"],
  ["cliente", "Clientes"],
  ["profesor", "Profesores"],
  ["caddie", "Caddies"],
  ["admin", "Admin."],
] as const;

export function PeopleFilter({ tab, q, role }: { tab: "usuarios" | "ninos"; q: string; role?: string | null }) {
  return (
    <div className="px-4 pt-3">
      <form action="/personas" className="flex gap-2">
        {tab === "ninos" && <input type="hidden" name="tab" value="ninos" />}
        {role && <input type="hidden" name="rol" value={role} />}
        <input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre" aria-label="Buscar por nombre" className={inputClass} />
      </form>
      {tab === "usuarios" && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {ROLES.map(([k, l]) => (
            <Link
              key={l}
              href={`/personas?${new URLSearchParams({ ...(k ? { rol: k } : {}), ...(q ? { q } : {}) })}`}
              className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] ${role === k || (!role && !k) ? "bg-ink font-semibold text-white" : "border border-line bg-surface"}`}
            >
              {l}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
