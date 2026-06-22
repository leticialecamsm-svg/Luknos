import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getShipments } from '@/lib/actions'
import { ShippingWorkspace } from '@/components/shipping/ShippingWorkspace'

export const dynamic = 'force-dynamic'

export default async function ShippingPreview() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const shipments = await getShipments()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Expedição <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-2">preview</span></h1>
        <p className="text-sm text-gray-500 mt-0.5">Proatividade — primeiro o que precisa ser feito; filtros revelam o resto (preview p/ aprovação)</p>
      </div>
      <ShippingWorkspace initialShipments={shipments} />
    </div>
  )
}
