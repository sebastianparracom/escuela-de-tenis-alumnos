"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionState } from "@/server/action";
import { markPayrollPaid } from "@/server/payroll";
import { ctxOf, requireUser } from "@/server/session";

export async function payAction(personId: string, start: string, end: string, _: ActionState): Promise<ActionState> {
  void _;
  return run(async () => {
    const ctx = await ctxOf(await requireUser(["admin"]));
    await markPayrollPaid(ctx, personId, { start, end });
    revalidatePath("/liquidacion");
    return "Liquidación marcada como pagada.";
  });
}
