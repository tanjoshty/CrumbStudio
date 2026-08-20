export interface CartState {
  total: number;
  cartItems: CartItem[];
  isCartOpen: boolean;
}

export interface CartActions {
  addItem: (item: CartItem) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

export type CartStore = CartState & CartActions;

export interface CartItem {
  lineId: string;
  name: string;
  productId: string;
  /**
   * Display price only. The server re-reads the real price from Sanity at
   * checkout and ignores whatever the client sends, so a tampered value here
   * changes what the customer sees, never what they are charged.
   */
  price: number;
  /**
   * Stable `_key` of the chosen Sanity `sizes[]` member. Price is looked up by
   * this, not by the size label: labels are editable in the Studio, and pricing
   * off one would break silently the first time a size is renamed.
   */
  sizeKey: string;
  variations: CartItemVariations;
  /** `yyyy-MM-dd`. Matches `order_item.fulfillment_date`, a Postgres `date`. */
  deliveryDate: string;
  notes: string;
}

export interface CartItemVariations {
  size: string;
  flavour: string;
  colour?: string;
}