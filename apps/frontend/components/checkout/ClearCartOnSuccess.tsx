"use client"

import { useEffect } from "react"

import { useCartStore } from "@/store/useCartStore"

/**
 * Empties the persisted cart once, on mount. Rendered by the return page only
 * on a confirmed-paid session — the cart must survive a declined or abandoned
 * payment so the customer can retry without rebuilding it.
 */
export function ClearCartOnSuccess() {
  const clearCart = useCartStore((s) => s.clearCart)
  useEffect(() => {
    clearCart()
  }, [clearCart])
  return null
}
