import { BottomNav } from "@/components/nav";
import { tabsFor } from "@/server/menu";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      <main className="mx-auto min-h-dvh max-w-3xl pb-28">{children}</main>
      <BottomNav items={tabsFor(user.roles)} />
    </>
  );
}
