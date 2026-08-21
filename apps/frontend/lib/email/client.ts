import { Resend } from "resend"

/**
 * Resend client singleton (server-only).
 *
 * One instance, reused across requests. Throws on a missing key at first use
 * rather than sending an empty string and getting an opaque auth error back.
 */
let resend: Resend | null = null

export function getResend(): Resend {
  if (!resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) {
      throw new Error("RESEND_API_KEY is not set")
    }
    resend = new Resend(key)
  }
  return resend
}
