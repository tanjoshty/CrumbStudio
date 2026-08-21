import { sendConfirmationEmails } from "@/lib/email/send"
import type { OrderEmailData, OrderEmailItem } from "@/lib/email/types"
import { client as sanityClient } from "@/lib/sanity/client"
import { PRODUCT_NAMES_QUERY } from "@/lib/sanity/queries"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Gather a confirmed order's detail and send the two confirmation emails, then
 * stamp `confirmation_sent_at`.
 *
 * The stamp is what makes this idempotent: a webhook replay reaches
 * `confirmOrder`'s already-confirmed no-op branch and never calls this, and even
 * a direct re-invocation returns early unless `force` is set (the admin resend
 * path). The product *name* isn't snapshotted on `order_item`, so it's looked
 * back up from Sanity here.
 */
export async function sendOrderConfirmation(
  orderId: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const db = createAdminClient()

  const { data: order, error } = await db
    .from("order")
    .select(
      "id, total, fulfillment_type, delivery_address, confirmation_sent_at, customer_id"
    )
    .eq("id", orderId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load order ${orderId}: ${error.message}`)
  }
  if (!order) {
    throw new Error(`Order ${orderId} not found`)
  }
  if (order.confirmation_sent_at && !opts.force) {
    return // already sent
  }

  const { data: customer } = await db
    .from("customer")
    .select("email, phone_number")
    .eq("id", order.customer_id)
    .maybeSingle()

  const { data: items, error: itemsError } = await db
    .from("order_item")
    .select("sanity_product_id, variations, unit_price, fulfillment_date, notes")
    .eq("order_id", orderId)

  if (itemsError) {
    throw new Error(`Failed to load items for ${orderId}: ${itemsError.message}`)
  }
  const rows = items ?? []

  const ids = [...new Set(rows.map((r) => r.sanity_product_id))]
  const products = ids.length
    ? await sanityClient.fetch<{ _id: string; name: string | null }[]>(
        PRODUCT_NAMES_QUERY,
        { ids }
      )
    : []
  const nameById = new Map(products.map((p) => [p._id, p.name ?? "Cake"]))

  const emailItems: OrderEmailItem[] = rows.map((row) => {
    const v = (row.variations ?? {}) as Record<string, string | undefined>
    return {
      name: nameById.get(row.sanity_product_id) ?? "Cake",
      size: v.size,
      flavour: v.flavour,
      colour: v.colour,
      fulfillmentDate: row.fulfillment_date,
      notes: row.notes ?? undefined,
      unitPrice: Number(row.unit_price),
    }
  })

  const email = customer?.email
  if (!email) {
    throw new Error(`Order ${orderId} has no customer email`)
  }

  const data: OrderEmailData = {
    orderId: order.id,
    customerEmail: email,
    phone: customer?.phone_number ?? undefined,
    total: Number(order.total),
    fulfillmentType: order.fulfillment_type,
    deliveryAddress: order.delivery_address,
    items: emailItems,
  }

  await sendConfirmationEmails(data)

  const { error: stampError } = await db
    .from("order")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", orderId)

  if (stampError) {
    // The email went out; only the bookkeeping failed. Log rather than throw —
    // throwing would signal the caller to retry a send that already succeeded.
    console.error(
      `[orders] confirmation sent but failed to stamp order ${orderId}`,
      stampError
    )
  }
}
