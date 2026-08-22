/** The shape both confirmation templates render from. No IO. */

export interface OrderEmailItem {
  name: string
  size?: string
  flavour?: string
  colour?: string
  /** `yyyy-MM-dd`. */
  fulfillmentDate: string
  notes?: string
  /** Dollars. */
  unitPrice: number
}

export interface OrderEmailData {
  orderId: string
  customerEmail: string
  phone?: string
  /** Dollars. */
  total: number
  fulfillmentType: "pickup" | "delivery"
  deliveryAddress?: string | null
  items: OrderEmailItem[]
}
