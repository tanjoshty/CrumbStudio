'use client'
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Product } from '@/types/sanity.types';
import { useProductPurchase } from './ProductPurchaseContext'
import { ProductDatePicker } from './ProductDatePicker'
import { CartItem } from '@/types/cart.types';
import { useCartStore } from '@/store/useCartStore';
import { useState } from 'react';

interface Props {
  hasCustomisation?: boolean;
  id?: Product["_id"];
  name?: string;
}

export function ProductVariants({
  id,
  name,
}: Props) {
  const {
    sizes,
    selectedSize,
    selectSize,
    colours,
    selectedColour,
    selectColour,
    flavours,
    selectedFlavour,
    selectFlavour,
    notes,
    setNotes,
    date,
  } = useProductPurchase()

  const [hasValidationError, setHasValidationError] = useState<boolean>(false)

  const {
    addItem,
    openCart,
  } = useCartStore()

  const requiresColour = Boolean(colours?.length)

  const handleAddToCart = () => {
    if (!selectedSize || !selectedFlavour || !date || (requiresColour && !selectedColour)) {
      setHasValidationError(true)
      return
    }

    const cartItem: CartItem = {
      lineId: crypto.randomUUID(),
      productId: id ?? '',
      price: selectedSize.price ?? 0,
      sizeKey: selectedSize._key,
      variations: {
        size: selectedSize.label ?? '',
        flavour: selectedFlavour,
        colour: selectedColour,
      },
      // yyyy-MM-dd, not toDateString(): this is compared against a Postgres
      // `date` server-side, and formatting is the display layer's job.
      deliveryDate: format(date, 'yyyy-MM-dd'),
      notes: notes ?? '',
      name: name ?? '',
    }

    addItem(cartItem)
    toast.success("Added to cart", {
      action: { label: "View cart", onClick: openCart },
    })
  }

  return (
    <div className='flex flex-col gap-8'>
      {/* Size */}
      {sizes?.length && 
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/60 mb-3">
            Size <span className="text-cobalt ml-2"><FieldError show={hasValidationError && !selectedSize} message="Please select a size" />{selectedSize?.label}</span>
          </p>
          <div className="flex gap-2.5">
            {sizes.map((s) => (
              <button key={s.label} onClick={() => s.label && selectSize(s.label)}
                className={`px-5 py-2.5 text-[12px] font-medium tracking-[0.1em] uppercase border transition-colors cursor-pointer
                  ${selectedSize?.label === s.label
                    ? 'bg-ink text-cream border-ink'
                    : 'bg-transparent text-ink border-cream-border hover:border-ink'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-light text-ink/60 mt-2">
            {'6" serves 8–10 · 8" serves 14–16 · 10" serves 22–25'}
          </p>
        </div>
      }

      {/* Colour */}
      { colours && 
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/60 mb-3">
            Colour <span className="text-cobalt ml-2"><FieldError show={hasValidationError && !selectedColour} message="Please select a colour" />{selectedColour}</span>
          </p>
          <div className="flex gap-3">
            {colours.map((c) => (
              <button key={c.label} onClick={() => c.label && selectColour(c.label)}
                title={c.label}
                className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer
                  ${selectedColour === c.label ? 'border-ink scale-110' : 'border-cream-border hover:border-ink/40'}`}
                style={{ backgroundColor: c.color?.hex }} />
            ))}
          </div>
        </div>
      }

      {/* Flavour */}
      {flavours?.length && 
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/60 mb-3">
            Flavour <span className="text-cobalt ml-2"><FieldError show={hasValidationError && !selectedFlavour} message="Please select a flavour" />{selectedFlavour}</span>
          </p>
          <div className="flex flex-wrap gap-2.5">
            {flavours.map((f) => (
              <button key={f} onClick={() => selectFlavour(f)}
                className={`px-4 py-2 text-[12px] font-medium tracking-[0.08em] uppercase border transition-colors cursor-pointer
                  ${selectedFlavour === f
                    ? 'bg-ink text-cream border-ink'
                    : 'bg-transparent text-ink border-cream-border hover:border-ink'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      }

      <div className="h-px bg-cream-border" />

      {/* Date */}
      <div>
        <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/60 mb-3">
          Pickup / Delivery Date <FieldError show={hasValidationError && !date} message="Please select a date" />
        </p>
        <div className="border border-cream-border p-4 flex items-center justify-between gap-4">
          <p className="text-[11px] font-light text-ink/60">We need at least 5 days notice</p>
          <ProductDatePicker />
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-ink/60 mb-3">
          Notes
          <span className="font-light normal-case tracking-normal text-ink/60 ml-2">(optional)</span>
        </p>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={`E.g. write 'Happy 30th Sarah' · nut allergy · surprise delivery`}
          className="w-full border border-cream-border bg-cream text-ink text-[13px] font-light px-4 py-3 placeholder:text-ink/60 focus:outline-none focus:border-ink resize-none transition-colors"
        />
      </div>

      {/* CTA */}
      <div className="flex gap-3 pt-2">
        <button onClick={handleAddToCart} className="flex-1 bg-cobalt text-cream text-[13px] font-medium tracking-[0.12em] uppercase py-[18px] cursor-pointer hover:bg-cobalt-dark transition-colors">
          Add to Cart
        </button>
      </div>

      <p className="text-[11px] font-light text-ink/60 tracking-[0.03em] -mt-4">
        Full payment required at checkout. Cancellations accepted up to 72 hours before your date.
      </p>
    </div>
  )
}

function FieldError({ show, message }: { show: boolean; message: string }) {
  if (!show) return null
  return <span className="text-red-500">{message}</span>
}