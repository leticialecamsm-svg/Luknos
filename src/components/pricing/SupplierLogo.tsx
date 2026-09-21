import { supplierBrand, onColor } from '@/lib/pricing/supplier-brand'

export function SupplierLogo({ name, size }: { name: string; size: number }) {
  const b = supplierBrand(name)
  return b.logo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={b.logo} alt={name} width={size} height={size} className="rounded-md object-contain bg-white shrink-0" style={{ width: size, height: size }} />
    : <span className="rounded-md flex items-center justify-center font-bold shrink-0" style={{ width: size, height: size, background: b.color, color: onColor(b.color), fontSize: size * 0.4 }}>{name.slice(0, 2).toUpperCase()}</span>
}
