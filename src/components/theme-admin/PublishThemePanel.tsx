'use client'

import { useState, useTransition } from 'react'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { publishTheme, type Theme } from '@/lib/theme-admin/actions'

export function PublishThemePanel({
  theme,
  flag,
}: {
  theme: Theme
  flag: { is_enabled: boolean; enabled_at: string | null } | null
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [published, setPublished] = useState(flag?.is_enabled ?? false)
  const [enabledAt, setEnabledAt] = useState(flag?.enabled_at ?? null)

  const handlePublish = async () => {
    const ok = await confirm(
      'Isso ativa o tema Viver de IA e liga a feature flag pros 7 usuários de uma vez, sem período de transição. Confirmar?',
      'Sim, publicar',
    )
    if (!ok) return
    startTransition(async () => {
      const res = await publishTheme(theme.slug)
      if (res && 'error' in res) return toast.error('Erro ao publicar', String(res.error))
      setPublished(true)
      setEnabledAt(res?.enabled_at ?? new Date().toISOString())
      if (res?.warning) toast.info('Publicado com aviso', res.warning)
      else toast.success('Tema publicado para todos os usuários')
    })
  }

  return (
    <div className="bg-white border border-surface-border rounded-xl p-6">
      {ConfirmDialog}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{theme.display_name}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {published ? 'Publicado' : 'Rascunho'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">v{theme.version}</p>
          {enabledAt && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Publicado em {new Date(enabledAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full border border-surface-border" style={{ background: theme.primary_color }} title={theme.primary_color} />
            <span className="w-6 h-6 rounded-full border border-surface-border" style={{ background: theme.accent_color }} title={theme.accent_color} />
          </div>
          <button
            onClick={handlePublish}
            disabled={pending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: theme.accent_color }}
          >
            <Sparkles className="w-4 h-4" />
            {published ? 'Republicar novo visual' : 'Publicar novo visual'}
          </button>
        </div>
      </div>
    </div>
  )
}
