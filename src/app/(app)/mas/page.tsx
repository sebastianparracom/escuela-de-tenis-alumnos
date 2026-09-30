import { Icon } from "@/components/icons";
import { Group, PageHeader, Row, SectionTitle } from "@/components/ui";
import { fullMenu } from "@/server/menu";
import { ROLE_LABEL } from "@/server/people";
import { requireUser } from "@/server/session";
import { logout } from "../../login/actions";

export const metadata = { title: "Más" };

/** D-01: menú combinado de todos los roles del usuario. */
export default async function MasPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader eyebrow={user.roles.map((r) => ROLE_LABEL[r]).join(" · ")} title="Más" />
      {fullMenu(user.roles).map((s) => (
        <div key={s.title}>
          <SectionTitle>{s.title}</SectionTitle>
          <Group>
            {s.items.map((it) => (
              <Row key={it.href} href={it.href} leading={<Icon name={it.icon} size={20} className="text-brand" />} title={it.label} />
            ))}
          </Group>
        </div>
      ))}
      <SectionTitle>Cuenta</SectionTitle>
      <Group>
        <Row href="/perfil" leading={<Icon name="user" size={20} className="text-brand" />} title="Mi perfil" subtitle={user.email} />
        <Row href="/cambiar-contrasena" leading={<Icon name="settings" size={20} className="text-brand" />} title="Cambiar contraseña" />
      </Group>
      <form action={logout} className="mx-4 mt-4">
        <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-danger">
          <Icon name="logout" size={18} />
          Cerrar sesión
        </button>
      </form>
    </>
  );
}
