import { addDays, format, parseISO, startOfWeek } from "date-fns"

/**
 * Week and weekday helpers for the capacity editor. Pure, client-safe.
 *
 * `day_of_week` in the DB is 0 = Mon … 6 = Sun (see `db/schema.sql`), and a
 * `capacity_override.week_start` is always the Monday of its week — matching
 * Postgres `date_trunc('week', …)`, which the capacity counting keys on. Snap
 * every week to that Monday here so an override lines up with the bookings it is
 * meant to govern.
 */

/** Index 0 = Mon … 6 = Sun. */
export const WEEKDAY_NAMES = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const

/** Monday (`yyyy-MM-dd`) of the week containing `dateKey`. */
export function weekStartOf(dateKey: string): string {
  const parsed = parseISO(dateKey)
  return format(startOfWeek(parsed, { weekStartsOn: 1 }), "yyyy-MM-dd")
}

/**
 * Compact label for a set of weekday indices, e.g. `[0,1,2,3] → "Mon–Thu"`,
 * `[4] → "Fri"`, `[0,1,3] → "Mon–Tue, Thu"`. Contiguous runs collapse to a range.
 */
export function formatWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 0) return "—"

  const runs: [number, number][] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last && d === last[1] + 1) last[1] = d
    else runs.push([d, d])
  }

  return runs
    .map(([a, b]) =>
      a === b
        ? WEEKDAY_NAMES[a]
        : `${WEEKDAY_NAMES[a]}–${WEEKDAY_NAMES[b]}`
    )
    .join(", ")
}

/**
 * Parse a max-items input. Returns the integer, or `null` if it isn't a
 * non-negative whole number (mirrors the DB CHECK `max_items >= 0`).
 */
export function parseMaxItems(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Is this a well-formed `yyyy-MM-dd` calendar day? */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = parseISO(value)
  return !Number.isNaN(d.getTime())
}

/** Every `yyyy-MM-dd` from `from` to `to` inclusive. `[]` if `to` is before `from`. */
export function expandDateRange(from: string, to: string): string[] {
  const start = parseISO(from)
  const end = parseISO(to)
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(format(d, "yyyy-MM-dd"))
  }
  return out
}

export interface ClosureRange {
  start: string
  end: string
  note: string | null
  dates: string[]
}

/**
 * Collapse per-date closures into contiguous ranges so a two-week holiday reads
 * (and reopens) as one span, not fourteen rows. A run breaks on a gap in dates
 * or a change of note.
 */
export function groupClosures(
  closures: { date: string; note: string | null }[]
): ClosureRange[] {
  const sorted = [...closures].sort((a, b) => a.date.localeCompare(b.date))
  const groups: ClosureRange[] = []

  for (const c of sorted) {
    const last = groups[groups.length - 1]
    const followsLast =
      last &&
      last.note === c.note &&
      format(addDays(parseISO(last.end), 1), "yyyy-MM-dd") === c.date

    if (followsLast) {
      last.end = c.date
      last.dates.push(c.date)
    } else {
      groups.push({ start: c.date, end: c.date, note: c.note, dates: [c.date] })
    }
  }

  return groups
}
