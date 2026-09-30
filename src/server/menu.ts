import type { NavItem } from "@/components/nav";
import type { Role } from "./context";
import { primaryRole } from "./session";

/** Pestañas del rol principal (D-01: el resto de secciones de sus roles va en "Más"). */
export function tabsFor(roles: Role[]): NavItem[] {
  const more: NavItem = { href: "/mas", label: "Más", icon: "more" };
  switch (primaryRole(roles)) {
    case "admin":
      return [
        { href: "/tablero", label: "Tablero", icon: "grid" },
        { href: "/cierres", label: "Cierres", icon: "check" },
        { href: "/pagos", label: "Pagos", icon: "wallet" },
        { href: "/personas", label: "Personas", icon: "users" },
        more,
      ];
    case "profesor":
      return [
        { href: "/hoy", label: "Hoy", icon: "home" },
        { href: "/tablero", label: "Agenda", icon: "calendar" },
        { href: "/sesiones", label: "Sesiones", icon: "chart" },
        more,
      ];
    case "caddie":
      return [{ href: "/sesiones", label: "Sesiones", icon: "chart" }, more];
    default:
      return [
        { href: "/inicio", label: "Inicio", icon: "home" },
        { href: "/reservar", label: "Reservar", icon: "calendar" },
        { href: "/historial", label: "Historial", icon: "clock" },
        more,
      ];
  }
}

export type MenuSection = { title: string; items: NavItem[] };

/** Menú combinado de todos los roles del usuario. */
export function fullMenu(roles: Role[]): MenuSection[] {
  const out: MenuSection[] = [];
  if (roles.includes("admin"))
    out.push({
      title: "Administración",
      items: [
        { href: "/tablero", label: "Tablero de canchas", icon: "grid" },
        { href: "/cierres", label: "Pendientes por cerrar", icon: "check" },
        { href: "/pagos", label: "Pagos", icon: "wallet" },
        { href: "/personas", label: "Personas y niños", icon: "users" },
        { href: "/grupos", label: "Grupos", icon: "list" },
        { href: "/liquidacion", label: "Liquidación", icon: "receipt" },
        { href: "/resumen", label: "Resumen del negocio", icon: "chart" },
        { href: "/configuracion", label: "Configuración", icon: "settings" },
      ],
    });
  if (roles.includes("profesor"))
    out.push({
      title: "Profesor",
      items: [
        { href: "/hoy", label: "Mis clases de hoy", icon: "home" },
        { href: "/tablero", label: "Agenda de canchas", icon: "calendar" },
        { href: "/sesiones", label: "Mis sesiones", icon: "chart" },
      ],
    });
  if (roles.includes("caddie") && !roles.includes("profesor"))
    out.push({ title: "Caddie", items: [{ href: "/sesiones", label: "Mis sesiones", icon: "chart" }] });
  if (roles.includes("caddie") && roles.includes("profesor"))
    out[out.length - 1].items.push({ href: "/sesiones?rol=caddie", label: "Mis sesiones como caddie", icon: "chart" });
  if (roles.includes("cliente"))
    out.push({
      title: "Cliente",
      items: [
        { href: "/inicio", label: "Mis bolsas y clases", icon: "home" },
        { href: "/reservar", label: "Reservar cancha", icon: "calendar" },
        { href: "/historial", label: "Historial", icon: "clock" },
      ],
    });
  return out;
}
