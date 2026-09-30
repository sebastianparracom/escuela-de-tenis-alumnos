import { ClassList } from "@/components/class-list";
import { Empty, Group, PageHeader, SectionTitle } from "@/components/ui";
import { pendingClosures } from "@/server/queries";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Pendientes por cerrar" };

export default async function CierresPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const items = await pendingClosures(ctx.db, ctx.now);
  const classes = items.filter((i) => i.kind !== "alquiler");
  const rentals = items.filter((i) => i.kind === "alquiler");
  return (
    <>
      <PageHeader eyebrow="Administración" title="Por cerrar" />
      <SectionTitle tone={rentals.length ? "danger" : "muted"}>Alquileres · {rentals.length}</SectionTitle>
      {rentals.length ? <ClassList items={rentals} showDate /> : <Group><Empty>No hay alquileres pendientes.</Empty></Group>}
      <SectionTitle tone={classes.length ? "danger" : "muted"}>Clases · {classes.length}</SectionTitle>
      {classes.length ? <ClassList items={classes} showDate /> : <Group><Empty>No hay clases pendientes.</Empty></Group>}
    </>
  );
}
