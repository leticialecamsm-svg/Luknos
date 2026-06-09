import { ShippingContainer } from '@/components/shipping/ShippingContainer'
import { getShipments } from '@/lib/actions'

export const metadata = {
  title: 'Expedição | Luknos',
}

export default async function ShippingPage() {
  const shipments = await getShipments()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Expedição</h1>
        <p className="text-gray-500 mt-1">Gerencie a separação e entrega de materiais</p>
      </div>

      {/* Container with tabs */}
      <ShippingContainer initialShipments={shipments} />
    </div>
  )
}
