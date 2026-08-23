import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { productNamesByIds } from "./product-names"
import { ACTIVE_STATUSES, type OrderStatus } from "./status"

/**
 * Admin reads.
 *
 * Service-role client (C3) — RLS denies the publishable key everything, and
 * these are trusted server surfaces. Every query excludes `pending`: those rows
 * are capacity holds, not orders (C2), and must never appear as real work.
 */

export interface QueueItem {
  itemId: string
  orderId: string
  status: OrderStatus
  productName: string
  size?: string
  flavour?: string
  colour?: string
  quantity: number
  notes?: string
  customerEmail: string | null
  fulfillmentType: "pickup" | "delivery"
}

export interface QueueDay {
  date: string // yyyy-MM-dd
  items: QueueItem[]
}

export interface OrderRow {
  id: string
  status: OrderStatus
  total: number
  createdAt: string
  fulfillmentType: "pickup" | "delivery"
  customerEmail: string | null
  itemCount: number
  nextDate: string | null // earliest fulfilment date on the order
}

export interface OrderDetailItem {
  id: string
  productName: string
  size?: string
  flavour?: string
  colour?: string
  quantity: number
  unitPrice: number
  fulfillmentDate: string
  notes?: string
}

export interface OrderDetail {
  id: string
  status: OrderStatus
  total: number
  createdAt: string
  fulfillmentType: "pickup" | "delivery"
  deliveryAddress: string | null
  customerEmail: string | null
  customerPhone: string | null
  refundedAt: string | null
  items: OrderDetailItem[]
}

type Variations = Record<string, string | undefined>

/** The bake queue: active items grouped by fulfilment date, soonest first. */
export async function getQueue(): Promise<QueueDay[]> {
  const db = createAdminClient()

  const { data: orders, error } = await db
    .from("order")
    .select(
      "id, status, fulfillment_type, customer:customer_id(email)"
    )
    .in("status", ACTIVE_STATUSES)

  if (error) throw new Error(`Failed to load queue orders: ${error.message}`)
  const orderRows = orders ?? []
  if (orderRows.length === 0) return []

  const { data: items, error: itemsError } = await db
    .from("order_item")
    .select(
      "id, order_id, sanity_product_id, variations, quantity, fulfillment_date, notes"
    )
    .in(
      "order_id",
      orderRows.map((o) => o.id)
    )
    .order("fulfillment_date", { ascending: true })

  if (itemsError) throw new Error(`Failed to load queue items: ${itemsError.message}`)
  const itemRows = items ?? []

  const orderById = new Map(orderRows.map((o) => [o.id, o]))
  const nameById = await productNamesByIds(
    itemRows.map((i) => i.sanity_product_id)
  )

  const byDate = new Map<string, QueueItem[]>()
  for (const row of itemRows) {
    const order = orderById.get(row.order_id)
    if (!order) continue
    const v = (row.variations ?? {}) as Variations
    const entry: QueueItem = {
      itemId: row.id,
      orderId: row.order_id,
      status: order.status as OrderStatus,
      productName: nameById.get(row.sanity_product_id) ?? "Cake",
      size: v.size,
      flavour: v.flavour,
      colour: v.colour,
      quantity: row.quantity,
      notes: row.notes ?? undefined,
      customerEmail: customerEmail(order.customer),
      fulfillmentType: order.fulfillment_type as "pickup" | "delivery",
    }
    const list = byDate.get(row.fulfillment_date) ?? []
    list.push(entry)
    byDate.set(row.fulfillment_date, list)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }))
}

/** Orders list, newest first, optionally filtered to one status. */
export async function getOrders(status?: OrderStatus): Promise<OrderRow[]> {
  const db = createAdminClient()

  let query = db
    .from("order")
    .select(
      "id, status, total, created_at, fulfillment_type, customer:customer_id(email), order_item(fulfillment_date)"
    )
    .neq("status", "pending")
    .order("created_at", { ascending: false })

  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load orders: ${error.message}`)

  return (data ?? []).map((o) => {
    const dates = ((o.order_item ?? []) as { fulfillment_date: string }[])
      .map((i) => i.fulfillment_date)
      .sort()
    return {
      id: o.id,
      status: o.status as OrderStatus,
      total: Number(o.total),
      createdAt: o.created_at,
      fulfillmentType: o.fulfillment_type as "pickup" | "delivery",
      customerEmail: customerEmail(o.customer),
      itemCount: (o.order_item ?? []).length,
      nextDate: dates[0] ?? null,
    }
  })
}

/** One order in full, or null. Returns `pending` orders too — the detail page
 *  is also where a stuck hold can be inspected. */
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const db = createAdminClient()

  const { data: order, error } = await db
    .from("order")
    .select(
      "id, status, total, created_at, fulfillment_type, delivery_address, refunded_at, customer:customer_id(email, phone_number), order_item(id, sanity_product_id, variations, quantity, unit_price, fulfillment_date, notes)"
    )
    .eq("id", id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load order ${id}: ${error.message}`)
  if (!order) return null

  const itemRows = (order.order_item ?? []) as Array<{
    id: string
    sanity_product_id: string
    variations: Variations | null
    quantity: number
    unit_price: string | number
    fulfillment_date: string
    notes: string | null
  }>
  const nameById = await productNamesByIds(
    itemRows.map((i) => i.sanity_product_id)
  )

  const customer = firstCustomer(order.customer)

  return {
    id: order.id,
    status: order.status as OrderStatus,
    total: Number(order.total),
    createdAt: order.created_at,
    fulfillmentType: order.fulfillment_type as "pickup" | "delivery",
    deliveryAddress: order.delivery_address ?? null,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone_number ?? null,
    refundedAt: order.refunded_at ?? null,
    items: itemRows
      .map((row) => {
        const v = (row.variations ?? {}) as Variations
        return {
          id: row.id,
          productName: nameById.get(row.sanity_product_id) ?? "Cake",
          size: v.size,
          flavour: v.flavour,
          colour: v.colour,
          quantity: row.quantity,
          unitPrice: Number(row.unit_price),
          fulfillmentDate: row.fulfillment_date,
          notes: row.notes ?? undefined,
        }
      })
      .sort((a, b) => a.fulfillmentDate.localeCompare(b.fulfillmentDate)),
  }
}

// PostgREST returns an embedded to-one either as an object or a single-element
// array depending on the relationship shape; normalise both.
function firstCustomer(
  c: unknown
): { email?: string | null; phone_number?: string | null } | null {
  if (!c) return null
  if (Array.isArray(c)) return c[0] ?? null
  return c as { email?: string | null; phone_number?: string | null }
}

function customerEmail(c: unknown): string | null {
  return firstCustomer(c)?.email ?? null
}
