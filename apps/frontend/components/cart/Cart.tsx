"use client"

import { format, parseISO } from "date-fns"

import { X, Trash2, ShoppingBag } from "lucide-react"

import { CartItem } from "@/types/cart.types"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

interface CartProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CartItem[]
  total: number
  onRemoveItem?: (lineId: string) => void
  onCheckout?: () => void
}

export function Cart({
  open,
  onOpenChange,
  items,
  total,
  onRemoveItem,
  onCheckout,
}: CartProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="bg-cream text-ink">
        {/* Header */}
        <DrawerHeader className="flex flex-row items-center justify-between border-b border-cream-border !pb-4 !text-left">
          <DrawerTitle className="font-display font-black text-2xl text-ink uppercase tracking-[0.02em]">
            Your Cart
          </DrawerTitle>
          <DrawerClose
            aria-label="Close cart"
            className="text-ink/60 hover:text-ink transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </DrawerClose>
        </DrawerHeader>

        {/* Items */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-ink/40 px-6 py-16">
              <ShoppingBag className="size-8" />
              <p className="text-[12px] font-medium tracking-[0.15em] uppercase">
                Your cart is empty
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-cream-border">
              {items.map((item) => (
                <li key={item.lineId} className="flex gap-4 px-5 py-5">
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-[20px] text-ink uppercase leading-none mb-2">
                      {item.name}
                    </p>
                    <div className="flex flex-col gap-0.5 text-[12px] font-light text-ink/70">
                      <span>Size: {item.variations.size}</span>
                      <span>Flavour: {item.variations.flavour}</span>
                      {item.variations.colour && (
                        <span>Colour: {item.variations.colour}</span>
                      )}
                      {item.deliveryDate && (
                        <span>Date: {format(parseISO(item.deliveryDate), 'EEE d MMM yyyy')}</span>
                      )}
                      {item.notes && <span className="italic">“{item.notes}”</span>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between shrink-0">
                    <span className="font-display font-extrabold text-lg text-burgundy">
                      ${item.price}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => onRemoveItem?.(item.lineId)}
                      className="text-ink/40 hover:text-cobalt transition-colors cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <DrawerFooter className="border-t border-cream-border gap-4 !pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/60">
              Total
            </span>
            <span className="font-display font-black text-[28px] text-burgundy leading-none">
              ${total}
            </span>
          </div>
          <button
            type="button"
            disabled={items.length === 0}
            onClick={onCheckout}
            className="w-full bg-cobalt text-cream text-[13px] font-medium tracking-[0.12em] uppercase py-[18px] cursor-pointer hover:bg-cobalt-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Checkout
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
