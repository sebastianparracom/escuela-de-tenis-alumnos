import { eq } from "drizzle-orm";
import { Avatar, Group, PageHeader, Row, SectionTitle } from "@/components/ui";
import { profiles } from "@/db/schema";
import { signedPhotoUrls } from "@/lib/supabase/admin";
import { ROLE_LABEL } from "@/server/people";
import { ctxOf, requireUser } from "@/server/session";

export const metadata = { title: "Mi perfil" };

/** RNF-04: el usuario ve su propio teléfono y correo. */
export default async function PerfilPage() {
  const user = await requireUser();
  const ctx = await ctxOf(user);
  const [p] = await ctx.db.select().from(profiles).where(eq(profiles.id, user.id));
  const photos = p.photoPath ? await signedPhotoUrls([p.photoPath]) : new Map();
  return (
    <>
      <PageHeader back={{ href: "/mas", label: "Más" }} title="Mi perfil" />
      <div className="flex flex-col items-center gap-2 py-4">
        <Avatar name={p.fullName} src={p.photoPath ? photos.get(p.photoPath) : null} size={84} />
        <div className="text-lg font-semibold">{p.fullName}</div>
        <div className="text-sm text-muted">{user.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</div>
      </div>
      <SectionTitle>Datos</SectionTitle>
      <Group>
        <Row title={p.email} subtitle="Correo" />
        <Row title={p.phone || "—"} subtitle="Teléfono" />
        {p.document && <Row title={p.document} subtitle="Documento" />}
      </Group>
      <p className="px-6 pt-3 text-xs text-muted">Para cambiar tus datos, habla con la administración.</p>
    </>
  );
}
