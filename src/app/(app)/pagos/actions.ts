"use server";

import { redirect } from "next/navigation";
import { num, run, str, strs, type ActionState } from "@/server/action";
import { registerClassPayment, registerRentalPayment, voidPayment } from "@/server/payments";
import type { LooseType } from "@/lib/pricing";
import { ctxOf, requireUser } from "@/server/session";
import { revalidatePath } from "next/cache";

async function adminCtx() {
  return ctxOf(await requireUser(["admin"]));
}

export async function classPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const what = str(fd, "what");
    const p = await registerClassPayment(await adminCtx(), {
      payerId: str(fd, "payerId"),
      studentId: str(fd, "studentId"),
      packageId: what.startsWith("pkg:") ? Number(what.slice(4)) : null,
      looseType: what.startsWith("suelta:") ? (what.slice(7) as LooseType) : null,
      quantity: num(fd, "quantity"),
      amount: num(fd, "amount") ?? -1,
      method: str(fd, "method") as "efectivo" | "transferencia",
      paidOn: str(fd, "paidOn"),
      reference: str(fd, "reference") || null,
    });
    id = p.id;
  });
  if (res?.ok) redirect(`/pagos/${id}?nuevo=1`);
  return res;
}

export async function rentalPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const p = await registerRentalPayment(await adminCtx(), {
      payerId: str(fd, "payerId"),
      bookingIds: strs(fd, "bookingIds"),
      method: str(fd, "method") as "efectivo" | "transferencia",
      paidOn: str(fd, "paidOn"),
      reference: str(fd, "reference") || null,
    });
    id = p.id;
  });
  if (res?.ok) redirect(`/pagos/${id}?nuevo=1`);
  return res;
}

export async function voidPaymentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await voidPayment(await adminCtx(), id, str(fd, "reason"));
    revalidatePath(`/pagos/${id}`);
    return "Pago anulado. Se revirtió su efecto.";
  });
}
