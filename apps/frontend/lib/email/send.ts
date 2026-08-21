import { getResend } from "./client"
import { renderBakerNotification, renderCustomerConfirmation } from "./templates"
import type { OrderEmailData } from "./types"

/**
 * Send the customer receipt and the baker notification for a confirmed order.
 *
 * Both are attempted independently (Promise.allSettled), so a failure on one
 * doesn't suppress the other. If either fails this throws — the caller leaves
 * `confirmation_sent_at` null so an admin resend (Phase 6) can retry, rather
 * than recording a send that only half happened.
 */
export async function sendConfirmationEmails(
  data: OrderEmailData
): Promise<void> {
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new Error("EMAIL_FROM is not set")
  }
  const baker = process.env.BAKER_EMAIL
  const resend = getResend()

  const customer = renderCustomerConfirmation(data)
  const sends: Array<{ label: string; promise: Promise<void> }> = [
    {
      label: "customer",
      promise: sendOne(resend, {
        from,
        to: data.customerEmail,
        rendered: customer,
      }),
    },
  ]

  if (baker) {
    const bakerEmail = renderBakerNotification(data)
    sends.push({
      label: "baker",
      promise: sendOne(resend, { from, to: baker, rendered: bakerEmail }),
    })
  } else {
    console.warn("[email] BAKER_EMAIL not set — baker notification skipped")
  }

  const results = await Promise.allSettled(sends.map((s) => s.promise))
  const failures = results
    .map((r, i) => ({ r, label: sends[i].label }))
    .filter((x) => x.r.status === "rejected")

  if (failures.length > 0) {
    const detail = failures
      .map(
        (f) =>
          `${f.label}: ${(f.r as PromiseRejectedResult).reason?.message ?? "unknown"}`
      )
      .join("; ")
    throw new Error(`Confirmation email(s) failed — ${detail}`)
  }
}

async function sendOne(
  resend: ReturnType<typeof getResend>,
  args: {
    from: string
    to: string
    rendered: { subject: string; html: string; text: string }
  }
): Promise<void> {
  // Resend returns errors in the payload rather than throwing — surface them.
  const { error } = await resend.emails.send({
    from: args.from,
    to: args.to,
    subject: args.rendered.subject,
    html: args.rendered.html,
    text: args.rendered.text,
  })
  if (error) {
    throw new Error(error.message)
  }
}
