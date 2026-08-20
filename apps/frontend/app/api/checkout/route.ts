import { NextRequest, NextResponse } from "next/server"

import { placeOrder } from "@/lib/orders/service"
import { parseCheckoutItems } from "@/lib/orders/parse"
import { createClient } from "@/lib/supabase/server"

interface CheckoutBody {
  items?: unknown
  email?: unknown
  phone?: unknown
  fulfillmentType?: unknown
  deliveryAddress?: unknown
}

/**
 * `POST /api/checkout`
 *
 * Takes the cart's *intent* — product ids, sizes, dates, notes — and returns a
 * Stripe client secret. Prices, totals and capacity are decided server-side;
 * anything the client says about money is ignored, so this handler validates
 * shape only and lets the service decide the rest.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CheckoutBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Malformed request." } },
      { status: 400 }
    )
  }

  const items = parseCheckoutItems(body.items)
  if (!items) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Your cart could not be read. Please refresh and try again.",
        },
      },
      { status: 400 }
    )
  }

  if (typeof body.email !== "string" || body.email.trim() === "") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "An email address is required.",
        },
      },
      { status: 400 }
    )
  }

  const fulfillmentType =
    body.fulfillmentType === "delivery" ? "delivery" : "pickup"

  // A signed-in customer's order is linked to their account; everyone else is a
  // guest. Read from cookies, never from the request body — the client does not
  // get to nominate whose order this is.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const result = await placeOrder({
    items,
    email: body.email.trim(),
    phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
    fulfillmentType,
    deliveryAddress:
      typeof body.deliveryAddress === "string" ? body.deliveryAddress : undefined,
    userId: user?.id ?? null,
    origin: request.nextUrl.origin,
  })

  if (!result.ok) {
    // These are the customer's to fix — wrong date, sold-out slot, missing
    // address — so they carry a 4xx and a message meant to be shown as-is.
    const status = result.error.code === "PAYMENT_SETUP_FAILED" ? 500 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    orderId: result.orderId,
    total: result.total,
  })
}
