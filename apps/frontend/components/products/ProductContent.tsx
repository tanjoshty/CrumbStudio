import { PortableText } from "next-sanity";
import Link from "next/link";
import { Product } from "@/types/sanity.types";
import { SelectedPrice } from "./SelectedPrice";

interface Props {
  description?: Product["description"];
  name?: string;
}

export function ProductContent({
  description,
  name,
}: Props) {
  return (
    <div className="flex flex-col gap-8">
      {/* Breadcrumb */}
        <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-ink/60">
          <Link href="/products" className="hover:text-cobalt transition-colors">Cakes</Link>
          <span className="mx-2">›</span>
          {name}
        </p>
 
        {/* Title + Price */}
        <div>
          <p className="text-[11px] font-medium tracking-[0.2em] uppercase text-cobalt mb-3">
            {name}
          </p>
          <div className="flex justify-between items-start gap-20">
            <h1 className="font-display font-black text-[64px] text-ink uppercase leading-[0.9] tracking-[-0.01em]">
              {name}
            </h1>
            <SelectedPrice />
          </div>
        </div>
 
        {/* Description */}
        {description ? (
          <div className="prose">
            <PortableText value={description} />
          </div>
        ) : null}
    </div>
  )
}