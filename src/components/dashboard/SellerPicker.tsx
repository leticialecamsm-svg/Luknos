'use client'

import { useRouter } from 'next/navigation'

export function SellerPicker({ sellers, selectedId }: { sellers: any[]; selectedId: string }) {
  const router = useRouter()
  return (
    <select
      value={selectedId}
      onChange={e => router.push(`/dashboard/meta-preview?userId=${e.target.value}`)}
      className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700"
    >
      {sellers.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  )
}
