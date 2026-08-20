/**
 * Minimum lead time, in days, between today and the earliest bookable
 * fulfilment date.
 *
 * Shared deliberately: the date picker greys out earlier dates and the server
 * rejects them. Two copies of this number would drift, and the drift is only
 * visible as a customer booking a date the baker cannot make.
 *
 * Client-safe — this module must not import anything server-only.
 */
export const MIN_NOTICE_DAYS = 5
