import type { OrderErrorCode } from "./types"
import type { CapacityCheck } from "@/lib/capacity/rules"

type Failures = Extract<CapacityCheck, { ok: false }>["failures"]

/**
 * Turns capacity failures into one sentence a customer can act on.
 *
 * Ordered by which fact is most useful: being too early is a mistake they can
 * correct precisely, a closed date needs a different day, and "just booked out"
 * is the race they could not have known about.
 */
export function capacityMessage(failures: Failures): string {
  if (failures.some((f) => f.reason === "too_soon")) {
    return "We need at least 5 days' notice. Please pick a later date."
  }
  if (failures.every((f) => f.reason === "closed")) {
    return "We are not baking on the date you picked. Please choose another."
  }
  return "That date has just been booked out. Please choose another."
}

/**
 * Maps a `place_order_hold` exception onto a customer-facing error.
 *
 * The function raises with machine-readable prefixes precisely so this does not
 * have to pattern-match prose. Anything unrecognised is our bug, not theirs, so
 * it is logged and reported as a setup failure rather than blamed on the date.
 */
export function holdErrorToMessage(
  message: string
): { code: OrderErrorCode; message: string } {
  if (message.includes("CAPACITY_FULL")) {
    return {
      code: "DATE_UNAVAILABLE",
      message: "That date has just been booked out. Please choose another.",
    }
  }
  if (message.includes("DATE_CLOSED")) {
    return {
      code: "DATE_UNAVAILABLE",
      message: "We are not baking on the date you picked. Please choose another.",
    }
  }
  if (message.includes("UNKNOWN_DATE")) {
    return {
      code: "DATE_UNAVAILABLE",
      message: "That date cannot be booked. Please choose another.",
    }
  }

  console.error("[orders] place_order_hold failed", message)
  return {
    code: "PAYMENT_SETUP_FAILED",
    message: "We could not reserve your date. Please try again.",
  }
}
