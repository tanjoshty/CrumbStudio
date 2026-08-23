"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { transitionOrderAction } from "@/app/admin/actions"
import {
  allowedTransitions,
  STATUS_LABELS,
  type OrderStatus,
} from "@/lib/orders/status"

export function StatusActions({
  orderId,
  status,
}: {
  orderId: string
  status: OrderStatus
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const next = allowedTransitions(status)
  const forward = next.filter((s) => s !== "cancelled")
  const canCancel = next.includes("cancelled")

  function move(to: OrderStatus) {
    setError(null)
    startTransition(async () => {
      const result = await transitionOrderAction(orderId, to)
      if (!result.ok) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  if (next.length === 0) {
    return (
      <p className="text-[12px] tracking-[0.08em] uppercase text-ink/45">
        No further actions.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {forward.map((to) => (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() => move(to)}
            className="bg-cobalt text-cream text-[12px] font-medium tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-cobalt-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Mark {STATUS_LABELS[to].toLowerCase()}
          </button>
        ))}
        {canCancel && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Cancel this order? This issues a full refund to the customer " +
                    "and frees the capacity slot for rebooking."
                )
              ) {
                move("cancelled")
              }
            }}
            className="bg-transparent text-burgundy border border-burgundy/40 text-[12px] font-medium tracking-[0.1em] uppercase px-5 py-2.5 hover:bg-burgundy hover:text-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel order
          </button>
        )}
      </div>
      {error && <p className="text-[13px] text-burgundy">{error}</p>}
    </div>
  )
}
