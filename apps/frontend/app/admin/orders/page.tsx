import { format, parseISO } from "date-fns"
import Link from "next/link"

import { StatusBadge } from "@/components/admin/StatusBadge"
import { getOrders } from "@/lib/orders/admin"
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status"

export const dynamic = "force-dynamic"

// Pending rows are holds, not orders (C2) — never offered as a filter.
const FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: STATUS_LABELS.confirmed },
  { value: "in_progress", label: STATUS_LABELS.in_progress },
  { value: "ready", label: STATUS_LABELS.ready },
  { value: "completed", label: STATUS_LABELS.completed },
  { value: "cancelled", label: STATUS_LABELS.cancelled },
]

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const active = FILTERS.some((f) => f.value === status)
    ? (status as OrderStatus)
    : undefined
  const orders = await getOrders(active)

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display font-black text-4xl uppercase leading-none">
        Orders
      </h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = (f.value === "all" && !active) || f.value === active
          const href =
            f.value === "all" ? "/admin/orders" : `/admin/orders?status=${f.value}`
          return (
            <Link
              key={f.value}
              href={href}
              className={`px-3.5 py-1.5 text-[11px] font-medium tracking-[0.1em] uppercase border transition-colors ${
                isActive
                  ? "bg-ink text-cream border-ink"
                  : "bg-paper text-ink border-cream-border hover:border-ink"
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      {orders.length === 0 ? (
        <p className="border border-cream-border bg-paper px-6 py-16 text-center text-[13px] tracking-[0.1em] uppercase text-ink/50">
          No orders{active ? ` with status “${STATUS_LABELS[active]}”` : ""} yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-cream-border bg-paper">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="text-[10px] tracking-[0.12em] uppercase text-ink/50 border-b border-cream-border">
                <th className="px-5 py-3 font-medium">Placed</th>
                <th className="px-5 py-3 font-medium">Next date</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-cream-border last:border-0 hover:bg-cream/50"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="text-cobalt hover:text-cobalt-dark text-[13px]"
                    >
                      {format(parseISO(o.createdAt), "d MMM yyyy")}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[13px]">
                    {o.nextDate
                      ? format(parseISO(o.nextDate), "EEE d MMM")
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-ink/75">
                    {o.customerEmail ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-ink/75">
                    {o.itemCount}
                  </td>
                  <td className="px-5 py-3.5 font-display font-extrabold text-burgundy">
                    ${o.total.toFixed(2)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
