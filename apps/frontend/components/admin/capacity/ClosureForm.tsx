"use client"

import { useActionState } from "react"

import { addClosureAction, type FormState } from "@/app/admin/capacity/actions"

const INITIAL: FormState = { ok: false }

export function ClosureForm() {
  const [state, action, pending] = useActionState(addClosureAction, INITIAL)

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink/55">
            Date to close
          </span>
          <input
            name="date"
            type="date"
            className="border border-cream-border bg-paper text-ink text-[14px] px-3 py-2 focus:outline-none focus:border-burgundy"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink/55">
            Note (optional)
          </span>
          <input
            name="note"
            type="text"
            placeholder="Away / holiday…"
            className="w-48 border border-cream-border bg-paper text-ink text-[14px] px-3 py-2 focus:outline-none focus:border-burgundy"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-cobalt text-cream text-[12px] font-medium tracking-[0.1em] uppercase px-4 py-2.5 hover:bg-cobalt-dark transition-colors disabled:opacity-40 cursor-pointer"
        >
          {pending ? "…" : "Close date"}
        </button>
      </div>
      {state.error && (
        <p className="text-[13px] text-burgundy">{state.error}</p>
      )}
      {state.ok && state.message && (
        <p className="text-[13px] text-cobalt">{state.message}</p>
      )}
    </form>
  )
}
