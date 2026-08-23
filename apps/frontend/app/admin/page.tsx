import { format, parseISO } from "date-fns"
import Link from "next/link"

import { StatusBadge } from "@/components/admin/StatusBadge"
import { getQueue } from "@/lib/orders/admin"

export const dynamic = "force-dynamic"

/** The bake queue — active items grouped by fulfilment date, soonest first. */
export default async function AdminQueuePage() {
  const days = await getQueue()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display font-black text-4xl uppercase leading-none">
          Queue
        </h1>
        <p className="text-[12px] tracking-[0.1em] uppercase text-ink/55">
          {days.reduce((n, d) => n + d.items.length, 0)} to bake
        </p>
      </div>

      {days.length === 0 ? (
        <p className="border border-cream-border bg-paper px-6 py-16 text-center text-[13px] tracking-[0.1em] uppercase text-ink/50">
          Nothing in the queue. New confirmed orders appear here on their date.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.date} className="flex flex-col gap-3">
              <h2 className="font-display font-black text-lg uppercase text-burgundy border-b border-cream-border pb-1.5">
                {format(parseISO(day.date), "EEEE d MMM yyyy")}
                <span className="text-ink/40 ml-2 text-sm">
                  · {day.items.length}
                </span>
              </h2>
              <ul className="flex flex-col divide-y divide-cream-border border border-cream-border bg-paper">
                {day.items.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex items-start gap-4 px-5 py-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-black text-lg uppercase leading-none">
                        {item.quantity > 1 && (
                          <span className="text-burgundy mr-1.5">
                            {item.quantity}×
                          </span>
                        )}
                        {item.productName}
                      </p>
                      <p className="text-[13px] text-ink/70 mt-1">
                        {[item.size, item.flavour, item.colour]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.notes && (
                        <p className="text-[13px] italic text-ink/55 mt-0.5">
                          “{item.notes}”
                        </p>
                      )}
                      <p className="text-[12px] text-ink/45 mt-1.5">
                        {item.fulfillmentType} · {item.customerEmail ?? "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={item.status} />
                      <Link
                        href={`/admin/orders/${item.orderId}`}
                        className="text-[11px] tracking-[0.1em] uppercase text-cobalt hover:text-cobalt-dark"
                      >
                        Order →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
