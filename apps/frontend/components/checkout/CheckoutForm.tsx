"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"

import { useCartStore } from "@/store/useCartStore"

interface CheckoutFormProps {
  /** Wire this to your submit/order-placement logic. */
  onPlaceOrder?: () => void
}
export function CheckoutForm({onPlaceOrder }: CheckoutFormProps) {
  const {
    cartItems,
    total
  } = useCartStore();
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup")
  const isEmpty = cartItems.length === 0

  // NOTE: the payment fields below are still the visual placeholder, and
  // nothing here creates a Checkout Session yet — Phase 3 replaces this with
  // Stripe's embedded form, calling POST /api/checkout once on submit.
  //
  // The previous version fired that POST from an effect keyed on the cart,
  // which was harmless against a stub but would now mint a pending order and
  // burn a capacity hold on every cart change.

  return (
    <div className="bg-cream text-ink min-h-screen">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onPlaceOrder?.()
        }}
        className="mx-auto max-w-5xl px-6 py-12 grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16"
      >
        {/* ── LEFT — form ─────────────────────────────────── */}
        <div className="flex flex-col gap-12">
          {/* Contact */}
          <Section step={1} title="Contact">
            <TextField label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
            <TextField label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="0412 345 678" />
          </Section>

          {/* Fulfilment */}
          <Section step={2} title="Fulfilment">
            <div className="flex gap-2.5">
              {(["pickup", "delivery"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFulfillment(opt)}
                  className={`px-5 py-2.5 text-[12px] font-medium tracking-[0.1em] uppercase border transition-colors cursor-pointer
                    ${fulfillment === opt
                      ? "bg-ink text-cream border-ink"
                      : "bg-paper text-ink border-cream-border hover:border-ink"}`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {fulfillment === "delivery" && (
              <TextArea
                label="Delivery address"
                name="delivery_address"
                placeholder="Unit / street, suburb, state, postcode"
              />
            )}
          </Section>

          {/* Payment — VISUAL PLACEHOLDER, replace with Stripe Elements */}
          <Section step={3} title="Payment">
            <p className="text-[12px] text-ink/60 -mt-2">
              Demo only — no payment is processed. Replace with Stripe.
            </p>
            <TextField label="Card number" name="card_number" inputMode="numeric" placeholder="1234 1234 1234 1234" />
            <div className="grid grid-cols-2 gap-4">
              <TextField label="Expiry" name="card_expiry" placeholder="MM / YY" />
              <TextField label="CVC" name="card_cvc" inputMode="numeric" placeholder="123" />
            </div>
            <TextField label="Name on card" name="card_name" autoComplete="cc-name" placeholder="Jane Baker" />
          </Section>
        </div>

        {/* ── RIGHT — order summary ───────────────────────── */}
        <aside className="lg:sticky lg:top-6 self-start border border-cream-border bg-paper">
          <div className="px-6 py-5 bg-ink">
            <h2 className="font-display font-black text-2xl text-cream uppercase tracking-[0.02em]">
              Order Summary
            </h2>
          </div>

          {isEmpty ? (
            <p className="px-6 py-10 text-center text-[12px] font-medium tracking-[0.15em] uppercase text-ink/50">
              Your cart is empty
            </p>
          ) : (
            <ul className="divide-y divide-cream-border">
              {cartItems.map((item) => (
                <li key={item.lineId} className="flex gap-4 px-6 py-5">
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-[18px] text-ink uppercase leading-none mb-1.5">
                      {item.name}
                    </p>
                    <p className="text-[13px] text-ink/75">
                      {[item.variations.size, item.variations.flavour, item.variations.colour]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {item.deliveryDate && (
                      <p className="text-[13px] text-ink/75">
                        {format(parseISO(item.deliveryDate), "EEE d MMM yyyy")}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-[13px] italic text-ink/55 mt-0.5">“{item.notes}”</p>
                    )}
                  </div>
                  <span className="font-display font-extrabold text-lg text-burgundy shrink-0">
                    ${item.price}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="px-6 py-5 border-t border-cream-border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/70">Total</span>
              <span className="font-display font-black text-[30px] text-burgundy leading-none">${total}</span>
            </div>
            <button
              type="submit"
              disabled={isEmpty}
              className="w-full bg-cobalt text-cream text-[13px] font-medium tracking-[0.12em] uppercase py-[18px] cursor-pointer hover:bg-cobalt-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Place Order
            </button>
            <p className="text-[12px] text-ink/60 tracking-[0.02em] text-center">
              Full payment required at checkout. Cancellations accepted up to 72 hours before your date.
            </p>
          </div>
        </aside>
      </form>
    </div>
  )
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-display font-black text-[28px] text-ink uppercase leading-none">
        <span className="text-burgundy mr-3">{step}</span>
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function TextField({ label, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/70">{label}</span>
      <input
        {...props}
        className="w-full border border-cream-border bg-paper text-ink text-[14px] px-4 py-3 placeholder:text-ink/40 focus:outline-none focus:border-burgundy transition-colors"
      />
    </label>
  )
}

function TextArea({ label, ...props }: { label: string } & React.ComponentProps<"textarea">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/70">{label}</span>
      <textarea
        rows={3}
        {...props}
        className="w-full border border-cream-border bg-paper text-ink text-[14px] px-4 py-3 placeholder:text-ink/40 focus:outline-none focus:border-burgundy resize-none transition-colors"
      />
    </label>
  )
}
