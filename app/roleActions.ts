"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { moveDelegateToSpeaker, type RoleMoveResult } from "@/lib/roleMove";

// Change role (Delegate → Speaker) from the delegate detail page. Returns a
// result (no redirect) so the RoleChip can navigate + toast itself.
export async function changeRole(delegateId: string): Promise<RoleMoveResult> {
  const user = await requireUser();
  const r = await moveDelegateToSpeaker(user, delegateId);
  if (r.ok) {
    revalidatePath("/delegates");
    revalidatePath(`/delegates/${delegateId}`);
  }
  return r;
}
