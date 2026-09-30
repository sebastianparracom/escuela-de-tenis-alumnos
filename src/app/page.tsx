import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/server/session";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  redirect(homeFor(user.roles));
}
