"use client"

import { useActionState } from "react"

import { addOverrideAction, type FormState } from "@/app/admin/capacity/actions"

const INITIAL: FormState = { ok: false }

export function OverrideForm({
  pools,
}: {
  pools: { key: string; label: string }[]
}) {
  const [state, action, pending] = useActionState(addOverrideAction, INITIAL)

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Labelled label="Pool">
          <select
            name="poolKey"
            defaultValue=""
            className="border border-cream-border bg-paper text-ink text-[14px] px-3 py-2 focus:outline-none focus:border-burgundy"
          >
            <option value="" disabled>
              Choose…
            </option>
            {pools.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Any day in the week">
          <input
            name="week"
            type="date"
            className="border border-cream-border bg-paper text-ink text-[14px] px-3 py-2 focus:outline-none focus:border-burgundy"
          />
        </Labelled>
        <Labelled label="Count">
          <input
            name="maxItems"
            type="number"
            min={0}
            step={1}
            placeholder="0"
            className="w-20 border border-cream-border bg-paper text-ink text-[14px] px-3 py-2 focus:outline-none focus:border-burgundy"
          />
        </Labelled>
        <Labelled label="Note (optional)">
          <input
            name="note"
            type="text"
            placeholder="Christmas week…"
            className="w-48 border border-cream-border bg-paper text-ink text-[14px] px-3 py-2 focus:outline-none focus:border-burgundy"
          />
        </Labelled>
        <button
          type="submit"
          disabled={pending}
          className="bg-cobalt text-cream text-[12px] font-medium tracking-[0.1em] uppercase px-4 py-2.5 hover:bg-cobalt-dark transition-colors disabled:opacity-40 cursor-pointer"
        >
          {pending ? "…" : "Add"}
        </button>
      </div>
      {state.error && (
        <p className="text-[13px] text-burgundy">{state.error}</p>
      )}
      {state.ok && state.message && (
        <p className="text-[13px] text-cobalt">{state.message}</p>
      )}
      <p className="text-[12px] text-ink/50">
        The week is set from whatever day you pick — it snaps to that week’s
        Monday. Count of 0 closes the pool for that week.
      </p>
    </form>
  )
}

function Labelled({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink/55">
        {label}
      </span>
      {children}
    </label>
  )
}
