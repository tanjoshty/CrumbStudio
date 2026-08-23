/** Order status labels and the admin-facing state machine. Pure, no IO. */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "ready"
  | "completed"
  | "cancelled"

/**
 * What the admin may move an order to from each status.
 *
 * `pending → confirmed` is the webhook's job, not the admin's, so `pending` has
 * no admin transitions. From there it moves forward one step at a time, and can
 * be `cancelled` from any active state. `completed` and `cancelled` are terminal.
 * Cancelling frees the slot for free: the `capacity_booking` view already
 * excludes `cancelled` orders, so no separate release step is needed.
 */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: [],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return ADMIN_TRANSITIONS[from] ?? []
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions(from).includes(to)
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In progress",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
}

/** Statuses that represent live bake work — what the queue shows. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  "confirmed",
  "in_progress",
  "ready",
]
