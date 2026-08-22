import { defineQuery } from 'next-sanity'

export const PRODUCTS_QUERY = defineQuery(
  `*[_type == "product" && active]`
)
export const PRODUCT_QUERY = defineQuery(
  `*[_type == "product" && slug.current == $slug][0]`
)
/**
 * Authoritative pricing for checkout.
 *
 * Narrow on purpose — the other two queries have no projection and return whole
 * documents. This one returns only what the server needs to price a cart and
 * decide whether a line is still orderable, so a Studio edit to unrelated
 * fields cannot change what gets charged.
 */
export const PRODUCT_PRICING_QUERY = defineQuery(
  `*[_type == "product" && _id in $ids]{
    _id,
    name,
    active,
    "sizes": sizes[]{ _key, label, price }
  }`
)

/**
 * Product names by id, for rendering a confirmation email. `order_item` snapshots
 * the variations but not the cake's name, so it is looked back up here at send
 * time — Sanity stays the source of truth for catalogue content.
 */
export const PRODUCT_NAMES_QUERY = defineQuery(
  `*[_type == "product" && _id in $ids]{ _id, name }`
)
