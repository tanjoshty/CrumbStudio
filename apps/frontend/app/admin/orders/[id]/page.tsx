import { format, parseISO } from "date-fns"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StatusActions } from "@/components/admin/StatusActions"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { getOrderDetail } from "@/lib/orders/admin"

export const dynamic = "force-dynamic"

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const order = await getOrderDetail(id)
  if (!order) notFound()

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <Link
          href="/admin/orders"
          className="text-[11px] tracking-[0.12em] uppercase text-cobalt hover:text-cobalt-dark"
        >
          ← Orders
        </Link>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <h1 className="font-display font-black text-3xl uppercase leading-none">
              Order
            </h1>
            <p className="text-[12px] text-ink/45 mt-1.5 font-mono">{order.id}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Actions */}
      <section className="border border-cream-border bg-paper px-5 py-5">
        <h2 className="text-[11px] tracking-[0.14em] uppercase text-ink/50 mb-3">
          Move status
        </h2>
        <StatusActions orderId={order.id} status={order.status} />
      </section>

      {/* Items */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] tracking-[0.14em] uppercase text-ink/50">
          Items
        </h2>
        <ul className="border border-cream-border bg-paper divide-y divide-cream-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="font-display font-black text-lg uppercase leading-none">
                  {item.quantity > 1 && (
                    <span className="text-burgundy mr-1.5">{item.quantity}×</span>
                  )}
                  {item.productName}
                </p>
                <p className="text-[13px] text-ink/70 mt-1">
                  {[item.size, item.flavour, item.colour]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-[13px] text-ink/60 mt-1">
                  {format(parseISO(item.fulfillmentDate), "EEE d MMM yyyy")}
                </p>
                {item.notes && (
                  <p className="text-[13px] italic text-ink/55 mt-0.5">
                    “{item.notes}”
                  </p>
                )}
              </div>
              <span className="font-display font-extrabold text-lg text-burgundy shrink-0">
                ${item.unitPrice.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between px-5">
          <span className="text-[11px] tracking-[0.14em] uppercase text-ink/60">
            Total
          </span>
          <span className="font-display font-black text-2xl text-burgundy">
            ${order.total.toFixed(2)}
          </span>
        </div>
      </section>

      {/* Customer + fulfilment */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <p>{order.customerEmail ?? "—"}</p>
          {order.customerPhone && (
            <p className="text-ink/70">{order.customerPhone}</p>
          )}
        </Field>
        <Field label={order.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}>
          <p className="capitalize">{order.fulfillmentType}</p>
          {order.fulfillmentType === "delivery" && (
            <p className="text-ink/70">{order.deliveryAddress ?? "—"}</p>
          )}
        </Field>
        <Field label="Placed">
          <p>{format(parseISO(order.createdAt), "d MMM yyyy, h:mmaaa")}</p>
        </Field>
        {order.refundedAt && (
          <Field label="Refund">
            <p className="text-burgundy">
              Fully refunded {format(parseISO(order.refundedAt), "d MMM yyyy")}
            </p>
          </Field>
        )}
      </section>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-cream-border bg-paper px-5 py-4">
      <p className="text-[11px] tracking-[0.14em] uppercase text-ink/50 mb-1.5">
        {label}
      </p>
      <div className="text-[14px] text-ink flex flex-col gap-0.5">{children}</div>
    </div>
  )
}
