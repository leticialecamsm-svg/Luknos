'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import { Portal } from '@/components/ui/Portal'
import { cn } from '@/lib/utils'
import { Megaphone, CalendarDays, Plus, Move, BookOpen, X, ArrowRight, ArrowLeft, Check } from 'lucide-react'

export const ONBOARDING_KEY = 'mkt_onboarding_done'

type Step = { icon: any; color: string; title: string; body: string; selector?: string }

const STEPS: Step[] = [
  {
    icon: Megaphone, color: '#6366F1',
    title: 'Bem-vindo ao Marketing',
    body: 'Aqui você planeja e acompanha todas as postagens das redes sociais. Vou destacar cada parte da tela em poucos passos.',
  },
  {
    icon: CalendarDays, color: '#0EA5E9', selector: '[data-tour="view-toggle"]',
    title: 'Visão de mês e semana',
    body: 'Alterne entre a visão mensal e semanal do calendário por aqui.',
  },
  {
    icon: CalendarDays, color: '#8B5CF6', selector: '[data-tour="period-nav"]',
    title: 'Navegar no tempo',
    body: 'Use as setas para avançar/voltar e o botão "Hoje" para retornar ao período atual.',
  },
  {
    icon: Plus, color: '#10B981', selector: '[data-tour="new-post"]',
    title: 'Criar uma postagem',
    body: 'Clique aqui (ou num dia do calendário) para cadastrar uma nova postagem: nome, tipo, datas, linha editorial e participantes.',
  },
  {
    icon: Move, color: '#F59E0B', selector: '[data-tour="calendar"]',
    title: 'O calendário',
    body: 'Cada card mostra o tipo, a linha editorial (colorida), a data de captação e os participantes. Clique num post para ver detalhes, mudar status e ver o histórico — ou arraste o card para outro dia para reagendar.',
  },
  {
    icon: BookOpen, color: '#EC4899', selector: '[data-tour="editorial-lines"]',
    title: 'Linhas editoriais',
    body: 'Aqui você cria, descreve e dá cor às linhas editoriais, e vê gráficos de distribuição de posts por tema e formato no mês.',
  },
  {
    icon: Check, color: '#14B8A6',
    title: 'Tudo pronto!',
    body: 'Você pode reabrir este tutorial quando quiser no botão "Tutorial", na barra lateral. Bom trabalho!',
  },
]

const PAD = 8
const CARD_W = 340

export function MarketingOnboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const Icon = s.icon

  // Mede o elemento-alvo (se houver) e mantém sincronizado com scroll/resize
  useLayoutEffect(() => {
    if (!s.selector) { setRect(null); return }
    const measure = () => {
      const el = document.querySelector(s.selector!) as HTMLElement | null
      if (!el) { setRect(null); return }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setRect(el.getBoundingClientRect())
    }
    measure()
    const t = setTimeout(measure, 300) // após o scroll suave
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [step, s.selector])

  function finish() {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); window.dispatchEvent(new Event('mkt-onboarding-done')) } catch {}
    onClose()
  }

  // Posição do card: ao lado/abaixo do alvo; centralizado se não houver alvo
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  let cardStyle: React.CSSProperties
  if (rect) {
    const spaceBelow = vh - rect.bottom
    const top = spaceBelow > 240 ? rect.bottom + PAD + 8 : Math.max(16, rect.top - 240)
    let left = rect.left + rect.width / 2 - CARD_W / 2
    left = Math.max(16, Math.min(left, vw - CARD_W - 16))
    cardStyle = { top, left, width: CARD_W }
  } else {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: CARD_W }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60]">
        {/* Overlay: recorte (spotlight) via box-shadow gigante quando há alvo; senão escurece tudo */}
        {rect ? (
          <div
            className="absolute rounded-xl ring-2 ring-white pointer-events-none transition-all duration-200"
            style={{
              top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
              boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-slate-900/55" onClick={finish} />
        )}

        {/* Card do passo */}
        <div className="absolute bg-white rounded-2xl shadow-2xl overflow-hidden" style={cardStyle}>
          <div className="flex items-start gap-3 p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${s.color}1A` }}>
              <Icon className="w-5 h-5" style={{ color: s.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Passo {step + 1} de {STEPS.length}</p>
              <h2 className="text-base font-bold text-gray-900 mt-0.5">{s.title}</h2>
            </div>
            <button onClick={finish} className="ml-auto p-1 text-gray-400 hover:text-gray-600 shrink-0"><X className="w-4 h-4" /></button>
          </div>
          <p className="px-4 text-sm text-gray-500 leading-relaxed">{s.body}</p>

          <div className="flex items-center gap-1.5 px-4 mt-4">
            {STEPS.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-5' : 'w-1.5')}
                style={{ backgroundColor: i <= step ? s.color : '#E5E7EB' }} />
            ))}
          </div>

          <div className="flex items-center justify-between p-4">
            <button onClick={finish} className="text-sm text-gray-400 hover:text-gray-600">Pular</button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
              )}
              {last ? (
                <button onClick={finish} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-sm"><Check className="w-4 h-4" /> Concluir</button>
              ) : (
                <button onClick={() => setStep(step + 1)} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-sm">Próximo <ArrowRight className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
