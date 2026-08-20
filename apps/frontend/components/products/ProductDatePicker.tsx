"use client"

import { useEffect, useState } from "react"
import { addDays, endOfMonth, format, startOfMonth } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { MIN_NOTICE_DAYS } from "@/lib/capacity/constants"
import { useProductPurchase } from "./ProductPurchaseContext"

interface AvailabilityDay {
  date: string
  remaining: number
  unavailable: boolean
  reason: "closed" | "too_soon" | "full" | null
}

export function ProductDatePicker() {
  const { date, setDate } = useProductPurchase()
  const earliestDate = addDays(new Date(), MIN_NOTICE_DAYS)

  const [month, setMonth] = useState(() => startOfMonth(date ?? earliestDate))
  const monthKey = format(month, "yyyy-MM")

  // Keyed by month so loading is derived, not a second piece of state set from
  // inside the effect — that would cascade a render on every month change.
  const [loaded, setLoaded] = useState<{
    monthKey: string
    unavailable: Date[]
  } | null>(null)

  const isLoaded = loaded?.monthKey === monthKey
  const unavailable = isLoaded ? loaded.unavailable : []

  useEffect(() => {
    const controller = new AbortController()
    const from = `${monthKey}-01`
    const to = format(endOfMonth(month), "yyyy-MM-dd")

    fetch(`/api/availability?from=${from}&to=${to}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(({ days }: { days: AvailabilityDay[] }) => {
        setLoaded({
          monthKey,
          unavailable: days
            .filter((day) => day.unavailable)
            // Parse as local midnight; `new Date("yyyy-MM-dd")` is parsed as UTC
            // and would shift the day backwards west of Greenwich.
            .map((day) => new Date(`${day.date}T00:00:00`)),
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        // Leave the calendar open on failure rather than greying everything
        // out: the server re-checks capacity at checkout, so an unavailable
        // date slipping through here is caught there — whereas a blank calendar
        // just looks broken.
        console.error("[availability] fetch failed", error)
        setLoaded({ monthKey, unavailable: [] })
      })

    return () => controller.abort()
  }, [month, monthKey])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-empty={!date}
            className="justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
          />
        }
      >
        <CalendarIcon />
        {date ? format(date, "PPP") : <span>Select a date</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          month={month}
          onMonthChange={setMonth}
          startMonth={startOfMonth(new Date())}
          disabled={[{ before: earliestDate }, ...unavailable]}
          modifiers={{ loading: isLoaded ? [] : { after: earliestDate } }}
          modifiersClassNames={{ loading: "opacity-60" }}
        />
      </PopoverContent>
    </Popover>
  )
}
