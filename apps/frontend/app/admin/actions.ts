"use server"

import { revalidatePath } from "next/cache"

import { isAdmin } from "@/lib/auth/admin"
import { updateOrderStatus, type TransitionResult } from "@/lib/orders/service"
import type { OrderStatus } from "@/lib/orders/status"
import { createClient } from "@/lib/supabase/server"

/**
 * Move an order to a new status.
 *
 * A server action is a public endpoint, so it re-checks admin itself rather than
 * trusting that the proxy ran — defence in depth. The state-machine validation
 * lives in `updateOrderStatus`; this just gates and revalidates.
 */
export async function transitionOrderAction(
  orderId: string,
  next: OrderStatus
): Promise<TransitionResult> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  if (!isAdmin(sub)) {
    return { ok: false, error: "Not authorised." }
  }

  const result = await updateOrderStatus(orderId, next)
  if (result.ok) {
    revalidatePath("/admin")
    revalidatePath("/admin/orders")
    revalidatePath(`/admin/orders/${orderId}`)
  }
  return result
}
