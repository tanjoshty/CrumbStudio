"use client"

import { useActionState } from "react"

import { setPoolMaxAction, type FormState } from "@/app/admin/capacity/actions"

const INITIAL: FormState = { ok: false }

export function PoolMaxForm({
  poolKey,
  current,
}: {
  poolKey: string
  current: number
}) {
  const [state, action, pending] = useActionState(setPoolMaxAction, INITIAL)

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="poolKey" value={poolKey} />
      <input
        name="maxItems"
        type="number"
        min={0}
        step={1}
        defaultValue={current}
        aria-label={`Weekly count for ${poolKey}`}
        className="w-16 border border-cream-border bg-paper text-ink text-[14px] px-2.5 py-1.5 focus:outline-none focus:border-burgundy"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] font-medium tracking-[0.1em] uppercase text-cobalt hover:text-cobalt-dark disabled:opacity-40 cursor-pointer"
      >
        {pending ? "…" : "Save"}
      </button>
      {state.error && (
        <span className="text-[12px] text-burgundy">{state.error}</span>
      )}
      {state.ok && state.message && (
        <span className="text-[12px] text-cobalt">{state.message}</span>
      )}
    </form>
  )
}
