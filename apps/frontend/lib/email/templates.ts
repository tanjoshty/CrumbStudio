import { format, parseISO } from "date-fns"

import type { OrderEmailData, OrderEmailItem } from "./types"

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Brand palette (mirrors app/globals.css). Email clients don't load web fonts
// reliably, so headings fall back through a condensed stack to a system sans.
const CREAM = "#FAF3E2"
const PAPER = "#FFFDF7"
const INK = "#12205A"
const BURGUNDY = "#7B2D3A"
const BORDER = "#EADFC6"
const HEADING_FONT =
  "'Barlow Condensed','Arial Narrow',Arial,sans-serif"
const BODY_FONT = "'Jost',Helvetica,Arial,sans-serif"

const CANCELLATION =
  "Full payment required at checkout. Cancellations accepted up to 72 hours before your date."

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fmtDate(iso: string): string {
  return format(parseISO(iso), "EEE d MMM yyyy")
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/** e.g. "6 Inch · Pistachio lemon · Cobalt" */
function optionsLine(item: OrderEmailItem): string {
  return [item.size, item.flavour, item.colour].filter(Boolean).join(" · ")
}

function distinctDates(items: OrderEmailItem[]): string[] {
  return [...new Set(items.map((i) => i.fulfillmentDate))].sort()
}

function fulfilmentText(data: OrderEmailData): string {
  if (data.fulfillmentType === "delivery") {
    return `Delivery to ${data.deliveryAddress ?? "(address on file)"}`
  }
  return "Pickup"
}

// ── Customer confirmation ─────────────────────────────────────────────────────

export function renderCustomerConfirmation(data: OrderEmailData): RenderedEmail {
  const dates = distinctDates(data.items)
  const spansMultipleDays = dates.length > 1

  const subject = "Your CrumbStudio order is confirmed"

  const itemRows = data.items
    .map((item) => {
      const opts = optionsLine(item)
      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid ${BORDER};font-family:${BODY_FONT};">
            <div style="font-family:${HEADING_FONT};font-size:19px;font-weight:800;color:${INK};text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(item.name)}</div>
            ${opts ? `<div style="font-size:14px;color:#4a5578;margin-top:3px;">${escapeHtml(opts)}</div>` : ""}
            <div style="font-size:14px;color:#4a5578;margin-top:3px;">${escapeHtml(fmtDate(item.fulfillmentDate))}</div>
            ${item.notes ? `<div style="font-size:13px;font-style:italic;color:#6b7396;margin-top:3px;">“${escapeHtml(item.notes)}”</div>` : ""}
          </td>
          <td style="padding:16px 0;border-bottom:1px solid ${BORDER};text-align:right;vertical-align:top;font-family:${HEADING_FONT};font-size:18px;font-weight:800;color:${BURGUNDY};white-space:nowrap;">${money(item.unitPrice)}</td>
        </tr>`
    })
    .join("")

  const spanNote = spansMultipleDays
    ? `<p style="font-size:14px;color:${INK};margin:0 0 20px;font-family:${BODY_FONT};">Heads up — your order spans a few dates: ${dates
        .map(fmtDate)
        .join(", ")}. Each cake is ready on its own date above.</p>`
    : ""

  const html = shell(`
    <tr>
      <td style="padding:32px 32px 8px;">
        <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${BURGUNDY};margin:0 0 6px;font-family:${BODY_FONT};font-weight:600;">Order confirmed</p>
        <h1 style="font-family:${HEADING_FONT};font-size:40px;line-height:1;font-weight:800;color:${INK};text-transform:uppercase;margin:0;">Thank you</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0;">
        <p style="font-size:15px;color:${INK};line-height:1.6;margin:0 0 4px;font-family:${BODY_FONT};">Your payment went through and your order is booked in. We can't wait to bake for you.</p>
        <p style="font-size:13px;color:#6b7396;margin:0 0 20px;font-family:${BODY_FONT};">Order reference: ${escapeHtml(data.orderId)}</p>
        ${spanNote}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${itemRows}
          <tr>
            <td style="padding:18px 0 0;font-family:${HEADING_FONT};font-size:14px;font-weight:700;color:${INK};text-transform:uppercase;letter-spacing:1px;">Total</td>
            <td style="padding:18px 0 0;text-align:right;font-family:${HEADING_FONT};font-size:26px;font-weight:800;color:${BURGUNDY};">${money(data.total)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${CREAM};">
          <tr><td style="padding:16px 18px;font-family:${BODY_FONT};font-size:14px;color:${INK};">
            <strong style="text-transform:uppercase;letter-spacing:1px;font-size:12px;">${data.fulfillmentType === "delivery" ? "Delivery" : "Pickup"}</strong><br/>
            ${escapeHtml(fulfilmentText(data))}
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 32px;">
        <p style="font-size:12px;color:#6b7396;line-height:1.6;margin:0;font-family:${BODY_FONT};">${CANCELLATION}</p>
      </td>
    </tr>
  `)

  const text = [
    "YOUR CRUMBSTUDIO ORDER IS CONFIRMED",
    "",
    "Your payment went through and your order is booked in.",
    `Order reference: ${data.orderId}`,
    "",
    spansMultipleDays
      ? `Note: your order spans a few dates (${dates.map(fmtDate).join(", ")}).\n`
      : "",
    ...data.items.map((item) => {
      const opts = optionsLine(item)
      return [
        `- ${item.name}${opts ? ` (${opts})` : ""}`,
        `  ${fmtDate(item.fulfillmentDate)}`,
        item.notes ? `  Note: ${item.notes}` : "",
        `  ${money(item.unitPrice)}`,
      ]
        .filter(Boolean)
        .join("\n")
    }),
    "",
    `TOTAL: ${money(data.total)}`,
    "",
    fulfilmentText(data),
    "",
    CANCELLATION,
  ]
    .filter((l) => l !== "")
    .join("\n")

  return { subject, html, text }
}

// ── Baker notification ────────────────────────────────────────────────────────

export function renderBakerNotification(data: OrderEmailData): RenderedEmail {
  // Sorted by fulfilment date: this is the bake queue, not a receipt.
  const items = [...data.items].sort((a, b) =>
    a.fulfillmentDate.localeCompare(b.fulfillmentDate)
  )
  const firstDate = items[0] ? fmtDate(items[0].fulfillmentDate) : "—"

  const subject = `New order — ${firstDate} — ${money(data.total)}`

  const itemRows = items
    .map((item) => {
      const opts = optionsLine(item)
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid ${BORDER};font-family:${BODY_FONT};">
            <div style="font-family:${HEADING_FONT};font-size:16px;font-weight:800;color:${BURGUNDY};text-transform:uppercase;">${escapeHtml(fmtDate(item.fulfillmentDate))}</div>
            <div style="font-size:15px;color:${INK};font-weight:600;margin-top:2px;">${escapeHtml(item.name)}</div>
            ${opts ? `<div style="font-size:14px;color:#4a5578;margin-top:2px;">${escapeHtml(opts)}</div>` : ""}
            ${item.notes ? `<div style="font-size:13px;font-style:italic;color:#6b7396;margin-top:2px;">“${escapeHtml(item.notes)}”</div>` : ""}
          </td>
        </tr>`
    })
    .join("")

  const html = shell(`
    <tr>
      <td style="padding:32px 32px 8px;">
        <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${BURGUNDY};margin:0 0 6px;font-family:${BODY_FONT};font-weight:600;">New order</p>
        <h1 style="font-family:${HEADING_FONT};font-size:36px;line-height:1;font-weight:800;color:${INK};text-transform:uppercase;margin:0;">${money(data.total)} · ${data.items.length} item${data.items.length === 1 ? "" : "s"}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0;">
        <p style="font-size:14px;color:${INK};margin:0 0 4px;font-family:${BODY_FONT};">${escapeHtml(data.customerEmail)}${data.phone ? ` · ${escapeHtml(data.phone)}` : ""}</p>
        <p style="font-size:14px;color:${INK};margin:0 0 4px;font-family:${BODY_FONT};">${escapeHtml(fulfilmentText(data))}</p>
        <p style="font-size:13px;color:#6b7396;margin:0 0 16px;font-family:${BODY_FONT};">Order reference: ${escapeHtml(data.orderId)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${itemRows}
        </table>
      </td>
    </tr>
    <tr><td style="padding:24px 32px 32px;"></td></tr>
  `)

  const text = [
    `NEW ORDER — ${money(data.total)} — ${data.items.length} item(s)`,
    "",
    `${data.customerEmail}${data.phone ? ` · ${data.phone}` : ""}`,
    fulfilmentText(data),
    `Order reference: ${data.orderId}`,
    "",
    ...items.map((item) => {
      const opts = optionsLine(item)
      return [
        `${fmtDate(item.fulfillmentDate)} — ${item.name}${opts ? ` (${opts})` : ""}`,
        item.notes ? `  Note: ${item.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    }),
  ].join("\n")

  return { subject, html, text }
}

/** Wraps the body rows in the shared outer table + ink header band. */
function shell(bodyRows: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${PAPER};border:1px solid ${BORDER};">
        <tr><td style="background:${INK};padding:18px 32px;">
          <span style="font-family:${HEADING_FONT};font-size:22px;font-weight:800;color:${CREAM};text-transform:uppercase;letter-spacing:1px;">CrumbStudio</span>
        </td></tr>
        ${bodyRows}
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
