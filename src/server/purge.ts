import { sql } from "drizzle-orm";
import { profiles } from "@/db/schema";
import type { DB } from "@/db/types";
import { eq } from "drizzle-orm";

/**
 * Elimina todo lo creado para la validación (D-36): usuarios y niños de prueba y todo lo que los
 * involucra. La configuración (canchas, franjas, tarifas, paquetes, motivos) se conserva.
 * Es el único proceso que borra datos, y solo datos de prueba. Devuelve los ids de acceso a borrar.
 */
export async function purgeTestData(db: DB): Promise<string[]> {
  const users = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isTest, true));
  await db.transaction(async (tx) => {
    const run = (q: ReturnType<typeof sql>) => tx.execute(q);
    await run(sql`create temp table t_bookings on commit drop as
      select b.id from bookings b
      left join students s on s.id = b.student_id
      left join profiles sp on sp.id = s.profile_id
      left join children sc on sc.id = s.child_id
      left join groups g on g.id = b.group_id
      where b.is_test
         or b.profesor_id in (select id from profiles where is_test)
         or b.caddie_id in (select id from profiles where is_test)
         or b.client_id in (select id from profiles where is_test)
         or coalesce(sp.is_test, false) or coalesce(sc.is_test, false) or coalesce(g.is_test, false)`);
    await run(sql`create temp table t_students on commit drop as
      select s.id from students s
      left join profiles p on p.id = s.profile_id
      left join children c on c.id = s.child_id
      where coalesce(p.is_test, false) or coalesce(c.is_test, false)`);
    await run(sql`create temp table t_payments on commit drop as
      select id from payments where is_test
        or payer_id in (select id from profiles where is_test)
        or student_id in (select id from t_students)
        or id in (select payment_id from payment_rentals where booking_id in (select id from t_bookings))`);
    await run(sql`delete from session_entries where booking_id in (select id from t_bookings) or person_id in (select id from profiles where is_test)`);
    await run(sql`delete from payroll_items where person_id in (select id from profiles where is_test)`);
    await run(sql`delete from bag_movements where student_id in (select id from t_students) or booking_id in (select id from t_bookings) or payment_id in (select id from t_payments)`);
    await run(sql`delete from payment_rentals where payment_id in (select id from t_payments) or booking_id in (select id from t_bookings)`);
    await run(sql`delete from payments where id in (select id from t_payments)`);
    await run(sql`delete from group_class_participants where booking_id in (select id from t_bookings) or child_id in (select id from children where is_test)`);
    await run(sql`delete from bookings where id in (select id from t_bookings)`);
    await run(sql`delete from group_members where child_id in (select id from children where is_test) or group_id in (select id from groups where is_test)`);
    await run(sql`delete from group_schedule where group_id in (select id from groups where is_test)`);
    await run(sql`delete from groups where is_test or profesor_id in (select id from profiles where is_test)`);
    await run(sql`delete from students where id in (select id from t_students)`);
    await run(sql`delete from child_guardians where child_id in (select id from children where is_test) or client_id in (select id from profiles where is_test)`);
    await run(sql`delete from children where is_test`);
    await run(sql`delete from user_roles where user_id in (select id from profiles where is_test)`);
    await run(sql`delete from profiles where is_test`);
  });
  return users.map((u) => u.id);
}
