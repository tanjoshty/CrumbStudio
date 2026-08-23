import { addDays, format, parseISO } from "date-fns"
import Link from "next/link"

import { ClosureForm } from "@/components/admin/capacity/ClosureForm"
import { OverrideForm } from "@/components/admin/capacity/OverrideForm"
import { PoolMaxForm } from "@/components/admin/capacity/PoolMaxForm"
import {
  getClosures,
  getOverrides,
  getPools,
  getWeekPreview,
} from "@/lib/capacity/admin"
import { formatWeekdays, groupClosures, weekStartOf } from "@/lib/capacity/week"
import {
  removeClosuresAction,
  removeOverrideAction,
} from "./actions"

export const dynamic = "force-dynamic"

const fmt = (key: string, pattern: string) => format(parseISO(key), pattern)

export default async function AdminCapacityPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const previewWeek = weekStartOf(week ?? format(new Date(), "yyyy-MM-dd"))

  const [pools, overrides, closures, preview] = await Promise.all([
    getPools(),
    getOverrides(),
    getClosures(),
    getWeekPreview(previewWeek),
  ])

  const poolLabel = (key: string) => {
    const pool = pools.find((p) => p.key === key)
    return pool ? `${formatWeekdays(pool.weekdays)} · ${pool.key}` : key
  }

  const prevWeek = format(addDays(parseISO(previewWeek), -7), "yyyy-MM-dd")
  const nextWeek = format(addDays(parseISO(previewWeek), 7), "yyyy-MM-dd")

  return (
    <div className="flex flex-col gap-12">
      <h1 className="font-display font-black text-4xl uppercase leading-none">
        Capacity
      </h1>

      {/* Pools */}
      <Section
        title="Weekly pools"
        blurb="The standing number of cakes each pool can take per week. Weekdays sharing a pool share one weekly allowance."
      >
        <ul className="border border-cream-border bg-paper divide-y divide-cream-border">
          {pools.map((pool) => (
            <li
              key={pool.key}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
            >
              <div>
                <p className="font-display font-black text-lg uppercase leading-none">
                  {formatWeekdays(pool.weekdays)}
                </p>
                <p className="text-[12px] text-ink/45">{pool.key}</p>
              </div>
              <PoolMaxForm poolKey={pool.key} current={pool.maxItems} />
            </li>
          ))}
        </ul>
      </Section>

      {/* Week preview */}
      <Section
        title="Week at a glance"
        blurb="Slots left per day for the chosen week, after overrides and closures — the same numbers a customer sees."
      >
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/admin/capacity?week=${prevWeek}`}
            className="text-[12px] tracking-[0.1em] uppercase text-cobalt hover:text-cobalt-dark"
          >
            ← Prev
          </Link>
          <span className="text-[13px] font-medium tracking-[0.08em] uppercase text-ink/70">
            Week of {fmt(previewWeek, "d MMM yyyy")}
          </span>
          <Link
            href={`/admin/capacity?week=${nextWeek}`}
            className="text-[12px] tracking-[0.1em] uppercase text-cobalt hover:text-cobalt-dark"
          >
            Next →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {preview.map((day) => (
            <div
              key={day.date}
              className={`border px-3 py-3 text-center ${
                day.closed
                  ? "border-cream-border bg-cream text-ink/40"
                  : day.remaining === 0
                    ? "border-burgundy/30 bg-burgundy/5"
                    : "border-cream-border bg-paper"
              }`}
            >
              <p className="text-[11px] tracking-[0.08em] uppercase text-ink/55">
                {fmt(day.date, "EEE")}
              </p>
              <p className="text-[13px] text-ink/70">{fmt(day.date, "d MMM")}</p>
              <p className="mt-1.5 font-display font-black text-xl">
                {day.closed ? (
                  <span className="text-ink/40 text-sm">Closed</span>
                ) : (
                  <span
                    className={
                      day.remaining === 0 ? "text-burgundy" : "text-ink"
                    }
                  >
                    {day.remaining}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Overrides */}
      <Section
        title="Per-week overrides"
        blurb="Bump or cut a pool's count for one week without changing the standing number. Count of 0 closes that pool for that week."
      >
        <div className="border border-cream-border bg-paper px-5 py-5">
          <OverrideForm
            pools={pools.map((p) => ({
              key: p.key,
              label: `${formatWeekdays(p.weekdays)} · ${p.key}`,
            }))}
          />
        </div>

        {overrides.length > 0 && (
          <ul className="mt-3 border border-cream-border bg-paper divide-y divide-cream-border">
            {overrides.map((o) => (
              <li
                key={`${o.poolKey}-${o.weekStart}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div>
                  <p className="text-[14px] text-ink">
                    <span className="font-medium">
                      Week of {fmt(o.weekStart, "d MMM yyyy")}
                    </span>{" "}
                    — {poolLabel(o.poolKey)} →{" "}
                    <span className="font-display font-black text-burgundy">
                      {o.maxItems}
                    </span>
                  </p>
                  {o.note && (
                    <p className="text-[13px] italic text-ink/55">{o.note}</p>
                  )}
                </div>
                <form action={removeOverrideAction.bind(null, o.poolKey, o.weekStart)}>
                  <button
                    type="submit"
                    className="text-[11px] tracking-[0.1em] uppercase text-burgundy hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Closures */}
      <Section
        title="Closed dates"
        blurb="Specific days you're unavailable — closed outright, regardless of pool capacity."
      >
        <div className="border border-cream-border bg-paper px-5 py-5">
          <ClosureForm />
        </div>

        {closures.length > 0 && (
          <ul className="mt-3 border border-cream-border bg-paper divide-y divide-cream-border">
            {groupClosures(closures).map((range) => (
              <li
                key={range.start}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div>
                  <p className="text-[14px] font-medium text-ink">
                    {range.start === range.end
                      ? fmt(range.start, "EEEE d MMM yyyy")
                      : `${fmt(range.start, "EEE d MMM")} – ${fmt(range.end, "EEE d MMM yyyy")}`}
                    {range.dates.length > 1 && (
                      <span className="text-ink/45 font-normal ml-2">
                        ({range.dates.length} days)
                      </span>
                    )}
                  </p>
                  {range.note && (
                    <p className="text-[13px] italic text-ink/55">
                      {range.note}
                    </p>
                  )}
                </div>
                <form action={removeClosuresAction.bind(null, range.dates)}>
                  <button
                    type="submit"
                    className="text-[11px] tracking-[0.1em] uppercase text-burgundy hover:underline cursor-pointer"
                  >
                    Reopen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display font-black text-xl uppercase text-burgundy">
          {title}
        </h2>
        <p className="text-[13px] text-ink/60 mt-0.5 max-w-2xl">{blurb}</p>
      </div>
      {children}
    </section>
  )
}
