import { client as sanityClient } from "@/lib/sanity/client"
import { PRODUCT_NAMES_QUERY } from "@/lib/sanity/queries"

/**
 * Look up product display names by Sanity id.
 *
 * `order_item` snapshots the chosen variations but not the cake's name, so any
 * surface that shows an order (the confirmation email, the admin views) resolves
 * names here — Sanity stays the source of truth for catalogue content. Missing
 * products fall back to "Cake" rather than blanking a line.
 */
export async function productNamesByIds(
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const products = await sanityClient.fetch<{ _id: string; name: string | null }[]>(
    PRODUCT_NAMES_QUERY,
    { ids: unique }
  )
  return new Map(products.map((p) => [p._id, p.name ?? "Cake"]))
}
