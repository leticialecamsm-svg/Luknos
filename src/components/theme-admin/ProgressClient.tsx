'use client'

import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui/Toast'
import { setScreenStatus, type ScreenProgress } from '@/lib/theme-admin/actions'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em progresso',
  done: 'Concluído',
  reviewed: 'Revisado',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-amber-50 text-amber-700',
  done: 'bg-blue-50 text-blue-700',
  reviewed: 'bg-green-50 text-green-700',
}
const STATUSES = ['pending', 'in_progress', 'done', 'reviewed']

export function ProgressClient({ screens }: { screens: ScreenProgress[] }) {
  const toast = useToast()
  const [items, setItems] = useState(screens)
  const [pending, startTransition] = useTransition()

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = items.filter(i => i.status === s).length
    return acc
  }, {})
  const total = items.length
  const donePct = total > 0 ? Math.round(((counts.done + counts.reviewed) / total) * 100) : 0

  const changeStatus = (screenSlug: string, newStatus: string) => {
    startTransition(async () => {
      const res = await setScreenStatus(screenSlug, newStatus)
      if (res.error) return toast.error('Erro ao atualizar status', res.error)
      setItems(items.map(i => (i.screen_slug === screenSlug ? { ...i, status: newStatus } : i)))
      toast.success('Status atualizado')
    })
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
        Nenhuma tela registrada no checklist.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUSES.map(s => (
          <div key={s} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{STATUS_LABEL[s]}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{counts[s]}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-500">Progresso geral</span>
          <span className="font-medium text-gray-900">{donePct}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${donePct}%`, background: '#cba455' }} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Módulo</th>
              <th className="px-4 py-2.5">Rota</th>
              <th className="px-4 py-2.5">Embed</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.screen_slug} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-900">{s.module_name}</td>
                <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{s.route_path}</td>
                <td className="px-4 py-2.5 text-gray-400 text-xs">{s.has_external_embed ? 'Sim' : '—'}</td>
                <td className="px-4 py-2.5">
                  <select
                    value={s.status}
                    disabled={pending}
                    onChange={e => changeStatus(s.screen_slug, e.target.value)}
                    className={`px-2 py-1 rounded-full text-xs font-medium border-0 outline-none ${STATUS_COLOR[s.status]}`}
                  >
                    {STATUSES.map(st => (
                      <option key={st} value={st}>{STATUS_LABEL[st]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
