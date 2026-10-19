'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X, Smartphone } from 'lucide-react'

// No celular, o CRM funciona como app instalado na tela inicial: só assim o iPhone entrega os avisos
// de mensagem (iOS 16.4+), e no Android o app abre sem a barra do navegador. Este convite aparece
// uma vez por mês enquanto o app não está instalado.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const KEY = 'crm-install-hint'

export function MobileInstallHint() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null)
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const android = /Android/.test(ua)
    if (!ios && !android) return
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return
    try {
      const last = Number(localStorage.getItem(KEY) ?? 0)
      if (last && Date.now() - last < 30 * 24 * 3600_000) return
    } catch { /* sem armazenamento: mostra */ }
    setPlatform(ios ? 'ios' : 'android')
    setShow(true)
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
  }
  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice.catch(() => null)
    dismiss()
  }

  if (!show || !platform) return null
  return (
    <div role="region" aria-label="Instalar o app" className="mb-2 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-950">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Instale o app e receba os avisos de mensagem no celular</p>
        {platform === 'ios' ? (
          <p className="mt-0.5">No Safari, toque em <Share className="inline h-3.5 w-3.5 -mt-0.5" aria-label="Compartilhar" /> <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Abra o app pelo ícone e aceite os avisos quando perguntar.</p>
        ) : installEvent ? (
          <button type="button" onClick={install} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">
            <Download className="h-3.5 w-3.5" /> Instalar o app
          </button>
        ) : (
          <p className="mt-0.5">No Chrome, abra o menu <b>⋮</b> e toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>). Depois aceite os avisos quando perguntar.</p>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dispensar" className="shrink-0 rounded p-0.5 hover:bg-sky-100"><X className="h-4 w-4" /></button>
    </div>
  )
}
