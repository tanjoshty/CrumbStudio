import { CartStore } from "@/types/cart.types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useCartStore = create<CartStore>()(
  persist((set, get) => ({
    total: 0,
    cartItems: [],
    isCartOpen: false,

    addItem: (item) => {
      const cartItems = [...get().cartItems, item]
      const total = cartItems.reduce((acc, cur) => acc + cur.price, 0)
      set({ total, cartItems })
    },

    removeItem: (lineId) => {
      const cartItems = get().cartItems.filter((item) => item.lineId !== lineId)
      const total = cartItems.reduce((acc, cur) => acc + cur.price, 0)
      set({ total, cartItems })
    },

    clearCart: () => set({ cartItems: [], total: 0 }),

    openCart: () => set({ isCartOpen: true }),
    closeCart: () => set({ isCartOpen: false }),
    toggleCart: () => set({ isCartOpen: !get().isCartOpen }),
  }),
  {
    name: 'cart-storage',
    partialize: (state) => ({ cartItems: state.cartItems, total: state.total }),
    // v1 lines carry no sizeKey and a `toDateString()` date, so checkout cannot
    // price or schedule them. There is no way to recover the missing size _key
    // from a label, so persisted v1 carts are dropped rather than migrated into
    // lines that would fail server-side with a confusing error.
    version: 2,
    migrate: () => ({ cartItems: [], total: 0 }),
  })
)