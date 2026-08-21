"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js"

import { getStripe } from "@/lib/stripe/client"
import { useCartStore } from "@/store/useCartStore"
import type { CartItem } from "@/types/cart.types"

type Fulfillment = "pickup" | "delivery"

/** The `{ code, message, offending }` shape `/api/checkout` returns on 4xx/5xx. */
interface CheckoutError {
  message: string
  offending?: string[]
}

export function CheckoutForm() {
  const { cartItems, total } = useCartStore()

  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup")
  const [deliveryAddress, setDeliveryAddress] = useState("")

  // Empty until the customer submits their details and we create a session —
  // opening this page must never mint a pending order or burn a capacity hold.
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<CheckoutError | null>(null)

  const isEmpty = cartItems.length === 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate what the DB and service would otherwise reject, so the customer
    // gets an inline message instead of a round-trip failure.
    if (!email.includes("@")) {
      setError({ message: "Please enter a valid email address." })
      return
    }
    if (fulfillment === "delivery" && deliveryAddress.trim() === "") {
      setError({ message: "A delivery address is required for delivery." })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim() || undefined,
          fulfillmentType: fulfillment,
          deliveryAddress:
            fulfillment === "delivery" ? deliveryAddress.trim() : undefined,
          // Intent only — ids, sizes, dates, notes. The server re-prices from
          // Sanity and ignores anything money-shaped we might send.
          items: cartItems.map((item) => ({
            productId: item.productId,
            sizeKey: item.sizeKey,
            fulfillmentDate: item.deliveryDate,
            variations: item.variations,
            notes: item.notes || undefined,
          })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(
          data?.error ?? {
            message: "Something went wrong. Please try again.",
          }
        )
        return
      }
      setClientSecret(data.clientSecret)
    } catch {
      setError({ message: "We couldn't reach the server. Please try again." })
    } finally {
      setSubmitting(false)
    }
  }

  // Once a session exists, the embedded form owns payment and its own redirect
  // to /checkout/return — so we drop the details form entirely.
  if (clientSecret) {
    return (
      <div className="bg-cream text-ink min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-12 grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div className="min-w-0">
            <h2 className="font-display font-black text-[28px] text-ink uppercase leading-none mb-6">
              <span className="text-burgundy mr-3">3</span>Payment
            </h2>
            <EmbeddedCheckoutProvider
              stripe={getStripe()}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
          <OrderSummary cartItems={cartItems} total={total} isEmpty={isEmpty} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-cream text-ink min-h-screen">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-5xl px-6 py-12 grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16"
      >
        {/* ── LEFT — details ──────────────────────────────── */}
        <div className="flex flex-col gap-12">
          {error && (
            <p
              role="alert"
              className="border border-burgundy/40 bg-burgundy/5 text-burgundy text-[13px] px-4 py-3"
            >
              {error.message}
            </p>
          )}

          <Section step={1} title="Contact">
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              label="Phone"
              type="tel"
              autoComplete="tel"
              placeholder="0412 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Section>

          <Section step={2} title="Fulfilment">
            <div className="flex gap-2.5">
              {(["pickup", "delivery"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFulfillment(opt)}
                  className={`px-5 py-2.5 text-[12px] font-medium tracking-[0.1em] uppercase border transition-colors cursor-pointer
                    ${
                      fulfillment === opt
                        ? "bg-ink text-cream border-ink"
                        : "bg-paper text-ink border-cream-border hover:border-ink"
                    }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {fulfillment === "delivery" && (
              <TextArea
                label="Delivery address"
                placeholder="Unit / street, suburb, state, postcode"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            )}
          </Section>

          <p className="text-[12px] text-ink/60 -mt-4">
            Card details are collected securely by Stripe on the next step.
          </p>
        </div>

        {/* ── RIGHT — order summary ───────────────────────── */}
        <OrderSummary
          cartItems={cartItems}
          total={total}
          isEmpty={isEmpty}
          footer={
            <>
              <button
                type="submit"
                disabled={isEmpty || submitting}
                className="w-full bg-cobalt text-cream text-[13px] font-medium tracking-[0.12em] uppercase py-[18px] cursor-pointer hover:bg-cobalt-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Starting…" : "Continue to Payment"}
              </button>
              <p className="text-[12px] text-ink/60 tracking-[0.02em] text-center">
                Full payment required at checkout. Cancellations accepted up to
                72 hours before your date.
              </p>
            </>
          }
        />
      </form>
    </div>
  )
}

function OrderSummary({
  cartItems,
  total,
  isEmpty,
  footer,
}: {
  cartItems: CartItem[]
  total: number
  isEmpty: boolean
  footer?: React.ReactNode
}) {
  return (
    <aside className="lg:sticky lg:top-6 self-start border border-cream-border bg-paper h-fit">
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
                  <p className="text-[13px] italic text-ink/55 mt-0.5">
                    “{item.notes}”
                  </p>
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
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/70">
            Total
          </span>
          <span className="font-display font-black text-[30px] text-burgundy leading-none">
            ${total}
          </span>
        </div>
        {footer}
      </div>
    </aside>
  )
}

function Section({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
}) {
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

function TextField({
  label,
  ...props
}: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/70">
        {label}
      </span>
      <input
        {...props}
        className="w-full border border-cream-border bg-paper text-ink text-[14px] px-4 py-3 placeholder:text-ink/40 focus:outline-none focus:border-burgundy transition-colors"
      />
    </label>
  )
}

function TextArea({
  label,
  ...props
}: { label: string } & React.ComponentProps<"textarea">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/70">
        {label}
      </span>
      <textarea
        rows={3}
        {...props}
        className="w-full border border-cream-border bg-paper text-ink text-[14px] px-4 py-3 placeholder:text-ink/40 focus:outline-none focus:border-burgundy resize-none transition-colors"
      />
    </label>
  )
}
