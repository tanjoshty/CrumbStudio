import { NextRequest, NextResponse } from "next/server"

import { getAvailability } from "@/lib/capacity/service"

/** Cap the window so one request cannot sweep years of the calendar. */
const MAX_RANGE_DAYS = 92

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * `GET /api/availability?from=yyyy-MM-dd&to=yyyy-MM-dd`
 *
 * Per-date availability for the date picker. Read-only, and safe to expose:
 * it returns how many slots remain, never who booked them.
 *
 * Not cached — capacity changes the moment anyone checks out, and a stale
 * calendar sells a slot that is already gone. Route Handlers are uncached by
 * default, so this is the absence of an opt-in rather than an opt-out.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  if (!from || !to) {
    return NextResponse.json(
      { error: "Both `from` and `to` are required (yyyy-MM-dd)." },
      { status: 400 }
    )
  }

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return NextResponse.json(
      { error: "`from` and `to` must be yyyy-MM-dd dates." },
      { status: 400 }
    )
  }

  if (from > to) {
    return NextResponse.json(
      { error: "`from` must not be after `to`." },
      { status: 400 }
    )
  }

  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `Range must be ${MAX_RANGE_DAYS} days or fewer.` },
      { status: 400 }
    )
  }

  try {
    const days = await getAvailability(from, to)
    return NextResponse.json({ days })
  } catch (error) {
    // Capacity failures are ours, not the caller's — log the detail, return none.
    console.error("[availability] failed", error)
    return NextResponse.json(
      { error: "Could not load availability." },
      { status: 500 }
    )
  }
}
