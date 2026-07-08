'use client'

import { useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { cn } from '@/lib/utils'
import { Megaphone, CalendarDays, Plus, Move, CircleDot, BookOpen, PieChart, X, ArrowRight, ArrowLeft, Check } from 'lucide-react'

export const ONBOARDING_KEY = 'mkt_onboarding_done'

const STEPS = [
  {
    icon: Megaphone, color: '#6366F1',
    title: 'Bem-vindo ao Marketing',
    body: 'Aqui você planeja e acompanha todas as postagens das redes sociais em um calendário. Vou te mostrar tudo em poucos passos.',
  },
  {
    icon: CalendarDays, color: '#0EA5E9',
    title: 'Calendário: mês e semana',
    body: 'Use os botões "Mês" e "Semana" para alternar a visão, e as setas para navegar no tempo. Cada card mostra o tipo do post, data de captação, a linha editorial (colorida) e quem participa.',
  },
  {
    icon: Plus, color: '#10B981',
    title: 'Criar uma postagem',
    body: 'Clique em "Nova postagem" (ou num dia do calendário). Preencha nome, tipo (Story, Reels, Carrossel), datas, linha editorial e participantes. Roteiro e participantes são opcionais — ative pelo interruptor.',
  },
  {
    icon: Move, color: '#F59E0B',
    title: 'Arraste para reagendar',
    body: 'Precisa mudar a data de um post? Basta arrastar o card para outro dia no calendário. A data de postagem é atualizada e salva na hora.',
  },
  {
    icon: CircleDot, color: '#EC4899',
    title: 'Status e histórico',
    body: 'Clique num post para ver os detalhes. Ali você troca o status (Agendado → Postado) com um clique e acompanha todo o histórico de alterações.',
  },
  {
    icon: BookOpen, color: '#8B5CF6',
    title: 'Linhas editoriais',
    body: 'No botão "Linhas editoriais" você cria, edita e descreve suas linhas — cada uma com uma cor que aparece nos cards. É a forma de organizar os temas do conteúdo.',
  },
  {
    icon: PieChart, color: '#14B8A6',
    title: 'Gráficos de apoio',
    body: 'Na página de linhas editoriais, os gráficos mostram a distribuição de posts por linha e por formato no mês — pra bater o olho e equilibrar o conteúdo.',
  },
]

export function MarketingOnboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const Icon = s.icon

  function finish() {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); window.dispatchEvent(new Event('mkt-onboarding-done')) } catch {}
    onClose()
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={finish} />
        <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Faixa colorida com blur */}
          <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${s.color}22, ${s.color}0A)` }}>
            <div className="pointer-events-none absolute -top-8 -right-6 w-40 h-40 rounded-full blur-2xl" style={{ backgroundColor: `${s.color}33` }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center">
                <Icon className="w-8 h-8" style={{ color: s.color }} />
              </div>
            </div>
            <button onClick={finish} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/60"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Passo {step + 1} de {STEPS.length}</p>
            <h2 className="text-lg font-bold text-gray-900 mt-1">{s.title}</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{s.body}</p>

            {/* Progresso */}
            <div className="flex items-center gap-1.5 mt-5">
              {STEPS.map((_, i) => (
                <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-6' : 'w-1.5')}
                  style={{ backgroundColor: i <= step ? s.color : '#E5E7EB' }} />
              ))}
            </div>

            <div className="flex items-center justify-between mt-6">
              <button onClick={finish} className="text-sm text-gray-400 hover:text-gray-600">Pular</button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button onClick={() => setStep(step - 1)} className="btn-secondary flex items-center gap-1.5 px-4">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </button>
                )}
                {last ? (
                  <button onClick={finish} className="btn-primary flex items-center gap-1.5 px-5"><Check className="w-4 h-4" /> Concluir</button>
                ) : (
                  <button onClick={() => setStep(step + 1)} className="btn-primary flex items-center gap-1.5 px-5">Próximo <ArrowRight className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
