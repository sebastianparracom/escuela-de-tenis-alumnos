import { auditLog } from "@/db/schema";
import type { Ctx } from "./context";

/** RNF-05: quién y cuándo registró, anuló o corrigió cada cosa. */
export async function audit(
  ctx: Ctx,
  action: string,
  entity: string,
  entityId: string | number,
  data?: unknown,
  reason?: string | null,
) {
  await ctx.db.insert(auditLog).values({
    actorId: ctx.actor.id,
    action,
    entity,
    entityId: String(entityId),
    data: data ?? null,
    reason: reason ?? null,
    createdAt: ctx.now,
  });
}
