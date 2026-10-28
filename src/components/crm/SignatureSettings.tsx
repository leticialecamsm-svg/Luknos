'use client'

import { cn } from '@/lib/utils'

function Switch({ on }: { on: boolean }) {
  return (
    <span className={cn('w-9 h-5 rounded-full relative transition-colors shrink-0', on ? 'bg-emerald-500' : 'bg-gray-300')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', on ? 'left-[1.125rem]' : 'left-0.5')} />
    </span>
  )
}

// Assinatura "*Nome:*" das mensagens: preferência da pessoa (todas as conversas) e, para quem assina,
// a exceção desta conversa.
export function SignatureSettings({ iSign, convHidden, onToggleMine, onToggleConv }: {
  iSign: boolean
  convHidden: boolean
  onToggleMine: () => void
  onToggleConv: () => void
}) {
  const row = 'w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left'
  return (
    <div className="text-sm text-gray-800">
      <button type="button" role="menuitemcheckbox" aria-checked={iSign} onClick={onToggleMine} className={row}>
        <span className="flex-1">
          Assinar minhas mensagens
          <span className="block text-xs text-gray-500">{iSign ? 'Seu nome vai no começo, em todas as conversas' : 'Desligado: vão só com a sua foto aqui no CRM'}</span>
        </span>
        <Switch on={iSign} />
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={iSign && !convHidden} disabled={!iSign} onClick={onToggleConv} className={cn(row, !iSign && 'opacity-40 cursor-not-allowed hover:bg-transparent')}>
        <span className="flex-1">
          Nesta conversa
          <span className="block text-xs text-gray-500">{!iSign ? 'Sem assinatura (sua preferência)' : convHidden ? 'Desligada só aqui' : 'Ligada'}</span>
        </span>
        <Switch on={iSign && !convHidden} />
      </button>
    </div>
  )
}
