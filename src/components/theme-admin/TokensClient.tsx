'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { updateDesignToken, type DesignToken } from '@/lib/theme-admin/actions'

const CATEGORY_LABEL: Record<string, string> = {
  color: 'Cores',
  typography: 'Tipografia',
  spacing: 'Espaçamento',
  radius: 'Raio',
  shadow: 'Sombra',
  motion: 'Movimento',
}

export function TokensClient({ tokens }: { tokens: DesignToken[] }) {
  const toast = useToast()
  const [items, setItems] = useState(tokens)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, startTransition] = useTransition()

  if (items.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
        Nenhum token cadastrado neste tema.
      </div>
    )
  }

  const byCategory = items.reduce<Record<string, DesignToken[]>>((acc, t) => {
    (acc[t.token_category] ??= []).push(t)
    return acc
  }, {})

  const save = (id: string) => {
    startTransition(async () => {
      const res = await updateDesignToken(id, draft)
      if (res.error) return toast.error('Erro ao salvar', res.error)
      setItems(items.map(t => (t.id === id ? { ...t, token_value: draft } : t)))
      toast.success('Token atualizado')
      setEditingId(null)
    })
  }

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([category, catTokens]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{CATEGORY_LABEL[category] ?? category}</h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {catTokens.map(t => (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs w-1/3">{t.token_key}</td>
                    <td className="px-4 py-2.5">
                      {editingId === t.id ? (
                        <input
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          {category === 'color' && (
                            <span className="w-4 h-4 rounded border border-gray-200 inline-block" style={{ background: t.token_value }} />
                          )}
                          <span className="text-gray-700">{t.token_value}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{t.description}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {editingId === t.id ? (
                        <>
                          <button onClick={() => save(t.id)} disabled={pending} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <button onClick={() => { setEditingId(t.id); setDraft(t.token_value) }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
