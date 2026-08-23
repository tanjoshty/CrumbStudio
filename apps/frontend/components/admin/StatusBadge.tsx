import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status"

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-transparent text-ink/50 border-cream-border border-dashed",
  confirmed: "bg-cobalt text-cream border-cobalt",
  in_progress: "bg-burgundy text-cream border-burgundy",
  ready: "bg-ink text-cream border-ink",
  completed: "bg-transparent text-ink/55 border-cream-border",
  cancelled: "bg-transparent text-ink/40 border-cream-border line-through",
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block border px-2.5 py-1 text-[10px] font-medium tracking-[0.12em] uppercase ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
