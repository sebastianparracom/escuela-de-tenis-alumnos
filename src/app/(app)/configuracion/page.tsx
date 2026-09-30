import { Icon } from "@/components/icons";
import { ActionForm, SubmitButton } from "@/components/forms";
import { FormCard, Group, PageHeader, Row, SectionTitle } from "@/components/ui";
import { hasTestData, TEST_DOMAIN } from "@/server/seed";
import { ctxOf } from "@/server/session";
import { seedAction } from "./actions";
import { requireUser } from "@/server/session";

export const metadata = { title: "Configuración" };

const ITEMS = [
  ["/configuracion/escuela", "Escuela y parámetros", "Nombre, logo, anticipación, turnos por reserva, liquidación", "settings"],
  ["/configuracion/canchas", "Canchas", "Nombre y estado (CA-10)", "grid"],
  ["/configuracion/franjas", "Franjas y turnos", "Entre semana y fin de semana (CA-11, CA-12)", "clock"],
  ["/configuracion/festivos", "Festivos", "Calendario de Colombia y ajustes", "calendar"],
  ["/configuracion/tarifas", "Tarifas", "Clases, alquiler y recargo por caddie (CA-20)", "wallet"],
  ["/configuracion/paquetes", "Paquetes", "Individuales y grupales, mínimo 4 clases (CA-21)", "receipt"],
  ["/configuracion/motivos", "Motivos de cancelación", "Lista cerrada (CA-33)", "list"],
] as const;

export default async function ConfiguracionPage() {
  const user = await requireUser(["admin"]);
  const ctx = await ctxOf(user);
  const testData = await hasTestData(ctx.db);
  return (
    <>
      <PageHeader eyebrow="Administración" title="Configuración" />
      <div className="mt-3">
        <Group>
          {ITEMS.map(([href, title, sub, icon]) => (
            <Row key={href} href={href} leading={<Icon name={icon} size={20} className="text-brand" />} title={title} subtitle={sub} />
          ))}
        </Group>
      </div>
      <SectionTitle>Datos de prueba</SectionTitle>
      <FormCard>
        {testData ? (
          <p className="text-sm text-muted">
            Hay datos de prueba cargados (usuarios <span className="font-mono">*.prueba@{TEST_DOMAIN}</span>). Se eliminan con el proceso técnico de purga antes de empezar a operar.
          </p>
        ) : (
          <ActionForm action={seedAction} confirm="¿Cargar usuarios y datos de prueba? Quedan marcados y se eliminan después con el proceso de purga.">
            <p className="text-sm text-muted">Crea usuarios de ejemplo para cada rol, niños, un grupo, pagos y reservas para validar la aplicación. Si faltan franjas, tarifas o paquetes, pone unos de ejemplo.</p>
            <SubmitButton variant="secondary" size="md" pendingText="Cargando…">Cargar datos de prueba</SubmitButton>
          </ActionForm>
        )}
      </FormCard>
    </>
  );
}
