import { Product, Slug } from '@/types/sanity.types';
import { ProductContent } from './ProductContent'
import { ProductVariants } from './ProductVariants'

interface Props {
  description?: Product["description"];
  hasCustomisation?: boolean;
  name?: string;
  slug?: Slug;
  id?: Product["_id"];
}

export function ProductDetails({
  description,
  hasCustomisation,
  name,
  id,
}: Props) {
  return (
    <div className="px-14 py-14 flex flex-col gap-4">
      <ProductContent
        description={description}
        name={name}
      />
      <ProductVariants
        hasCustomisation={hasCustomisation}
        id={id}
        name={name}
      />
    </div>
  )
}