import { Badge, Empty, Group, LinkButton, PageHeader, Row, SectionTitle } from "@/components/ui";
import { fullDate, money } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/labels";
import { listPayments } from "@/server/payments";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Pagos" };

/** CA-24: el sistema no cobra ni se conecta con bancos; solo guarda el registro que hace el administrador. */
export default async function PagosPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const list = await listPayments(ctx.db);
  return (
    <>
      <PageHeader eyebrow="Administración" title="Pagos" />
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <LinkButton href="/pagos/nuevo" icon="plus">Pago de clases</LinkButton>
        <LinkButton href="/pagos/alquiler" icon="plus" variant="secondary">Pago de alquiler</LinkButton>
      </div>
      <SectionTitle>Últimos pagos</SectionTitle>
      {list.length === 0 ? (
        <Group><Empty>Todavía no hay pagos registrados.</Empty></Group>
      ) : (
        <Group>
          {list.map((p) => (
            <Row
              key={p.id}
              href={`/pagos/${p.id}`}
              title={p.payer}
              subtitle={`${fullDate(p.paidOn)} · ${METHOD_LABEL[p.method]} · ${p.kind === "alquiler" ? "Alquiler" : (p.packageName ?? `${p.classes} ${p.bag === "grupal" ? "grupales" : "individuales"}`)}`}
              trailing={
                <span className="flex flex-col items-end gap-0.5">
                  <span className={`font-mono text-sm font-semibold ${p.status === "anulado" ? "text-faint line-through" : ""}`}>{money(p.amount)}</span>
                  {p.status === "anulado" && <Badge tone="red">Anulado</Badge>}
                </span>
              }
            />
          ))}
        </Group>
      )}
    </>
  );
}
