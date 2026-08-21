import { describe, expect, it } from "vitest"

import { renderBakerNotification, renderCustomerConfirmation } from "./templates"
import type { OrderEmailData } from "./types"

function make(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    orderId: "order-123",
    customerEmail: "jane@example.com",
    phone: "0412 345 678",
    total: 150,
    fulfillmentType: "pickup",
    deliveryAddress: null,
    items: [
      {
        name: "Signature Cake",
        size: "6 Inch",
        flavour: "Pistachio lemon",
        colour: "Cobalt",
        fulfillmentDate: "2026-08-30",
        notes: "Happy 30th Sarah",
        unitPrice: 100,
      },
      {
        name: "Mini Cake",
        size: "4 Inch",
        flavour: "Vanilla",
        fulfillmentDate: "2026-09-02",
        unitPrice: 50,
      },
    ],
    ...overrides,
  }
}

describe("renderCustomerConfirmation", () => {
  it("names, options, dates and total all appear in the HTML", () => {
    const { subject, html } = renderCustomerConfirmation(make())
    expect(subject).toBe("Your CrumbStudio order is confirmed")
    expect(html).toContain("Signature Cake")
    expect(html).toContain("6 Inch · Pistachio lemon · Cobalt")
    expect(html).toContain("Sun 30 Aug 2026")
    expect(html).toContain("$150.00")
    expect(html).toContain("Happy 30th Sarah")
  })

  it("flags an order that spans multiple fulfilment dates", () => {
    const { html, text } = renderCustomerConfirmation(make())
    expect(html).toContain("spans a few dates")
    expect(text).toContain("Sun 30 Aug 2026")
    expect(text).toContain("Wed 2 Sep 2026")
  })

  it("does not show the multi-date note for a single-date order", () => {
    const single = make({ items: [make().items[0]] })
    expect(renderCustomerConfirmation(single).html).not.toContain(
      "spans a few dates"
    )
  })

  it("shows the delivery address for a delivery order", () => {
    const delivery = make({
      fulfillmentType: "delivery",
      deliveryAddress: "1 Baker St, Melbourne VIC 3000",
    })
    const { html, text } = renderCustomerConfirmation(delivery)
    expect(html).toContain("1 Baker St, Melbourne VIC 3000")
    expect(text).toContain("Delivery to 1 Baker St")
  })

  it("carries the 72-hour cancellation line", () => {
    expect(renderCustomerConfirmation(make()).text).toContain(
      "Cancellations accepted up to 72 hours"
    )
  })

  it("escapes HTML in customer-supplied fields", () => {
    const nasty = make({
      items: [{ ...make().items[0], notes: "<script>alert('x')</script>" }],
    })
    const { html } = renderCustomerConfirmation(nasty)
    expect(html).not.toContain("<script>alert")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("renderBakerNotification", () => {
  it("sorts items by fulfilment date — the bake queue", () => {
    const reversed = make({
      items: [make().items[1], make().items[0]], // Sep 2 first, Aug 30 second
    })
    const { html } = renderBakerNotification(reversed)
    expect(html.indexOf("Sun 30 Aug 2026")).toBeLessThan(
      html.indexOf("Wed 2 Sep 2026")
    )
  })

  it("subject leads with the earliest date and the total", () => {
    expect(renderBakerNotification(make()).subject).toBe(
      "New order — Sun 30 Aug 2026 — $150.00"
    )
  })

  it("includes the customer's contact details", () => {
    const { html, text } = renderBakerNotification(make())
    expect(html).toContain("jane@example.com")
    expect(html).toContain("0412 345 678")
    expect(text).toContain("jane@example.com")
  })
})
