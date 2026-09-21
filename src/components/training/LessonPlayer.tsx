'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Zap, Undo2 } from 'lucide-react'
import { setLessonDone, submitQuiz, type LessonView, type CompleteResult, type QuizResult } from '@/lib/training/actions'
import { useToast } from '@/components/ui/Toast'
import { KIND_ICON, fmtMin, ProgressBar } from './ui'
import { RichBody } from './RichBody'
import { LessonVisual } from './visuals'
import { cn } from '@/lib/utils'

const CONFETTI = ['🎉', '✨', '⭐', '🎊', '🏆', '💛']

export function LessonPlayer({ view }: { view: LessonView }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(view.done)
  const [result, setResult] = useState<CompleteResult | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({})
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const l = view.lesson
  const Icon = KIND_ICON[l.kind] ?? KIND_ICON.text
  const backHref = `/treinamento/${view.trackId}`
  const nextHref = view.nextId ? `/treinamento/${view.trackId}/aula/${view.nextId}` : backHref

  function complete() {
    start(async () => {
      const res = await setLessonDone(l.id, true)
      if (res.error) return toast.error('Não foi possível concluir', res.error)
      setDone(true); setResult(res)
    })
  }
  function undo() {
    start(async () => {
      const res = await setLessonDone(l.id, false)
      if (res.error) return toast.error('Não foi possível desfazer', res.error)
      setDone(false); setResult(null); router.refresh()
    })
  }

  function sendQuiz() {
    start(async () => {
      const res = await submitQuiz(l.id, quizAnswers)
      if (res.error) return toast.error('Não foi possível enviar o teste', res.error)
      setQuizResult(res)
      if (res.passed) {
        setDone(true)
        setResult(res.complete ?? { xpGained: l.xp })
        toast.success(`Teste aprovado com ${res.score}%`)
      }
    })
  }

  const celebrate = !!(result && (result.trackCompleted || result.moduleCompleted || result.levelUp))

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 min-w-0">
          <ArrowLeft className="w-4 h-4 shrink-0" /> <span className="truncate">{view.trackTitle}</span>
        </Link>
        <span className="text-xs text-gray-400 shrink-0">Aula {view.position} de {view.total}</span>
      </div>

      <ProgressBar pct={(view.position / view.total) * 100} className="h-1.5" />

      <div className="pt-1">
        <p className="eyebrow">{view.moduleTitle}</p>
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold text-navy mt-2 leading-tight">{l.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="badge bg-surface-secondary text-gray-600 gap-1"><Icon className="w-3.5 h-3.5" /> ~{fmtMin(l.duration_min)} de leitura</span>
          <span className="badge bg-brand-50 text-brand-700 gap-1 font-semibold"><Zap className="w-3.5 h-3.5" /> +{l.xp} XP</span>
        </div>
      </div>

      {l.kind === 'text' && <LessonVisual title={l.title} />}

      {l.kind === 'text' && l.body && <RichBody body={l.body} />}

      <div className={cn('card overflow-hidden', l.kind === 'text' && !view.quiz && 'hidden')}>
        {(l.kind === 'youtube' || (l.kind === 'drive' && view.embedUrl)) && view.embedUrl && (
          <div className="aspect-video bg-black">
            <iframe src={view.embedUrl} title={l.title} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        )}
        {l.kind === 'drive' && !view.embedUrl && l.url && <LinkBlock url={l.url} label="Abrir arquivo do Drive" />}

        {l.kind === 'pdf' && (view.fileUrl || view.embedUrl) && (
          <div>
            <iframe src={view.fileUrl ?? view.embedUrl!} title={l.title} className="w-full h-[70vh] bg-surface-secondary" />
            {view.fileUrl && <div className="px-4 py-2 border-t border-surface-border text-right">
              <a href={view.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 inline-flex items-center gap-1">
                Abrir em nova aba <ExternalLink className="w-3 h-3" />
              </a>
            </div>}
          </div>
        )}

        {l.kind === 'image' && (
          view.fileUrl
            ? <img src={view.fileUrl} alt={l.title} className="w-full h-auto" />
            : view.embedUrl
              ? <iframe src={view.embedUrl} title={l.title} className="w-full h-[70vh]" />
              : l.url ? <img src={l.url} alt={l.title} className="w-full h-auto" /> : null
        )}

        {l.kind === 'link' && l.url && <LinkBlock url={l.url} label="Abrir conteúdo" />}

        {l.body && l.kind !== 'text' && (
          <div className="p-5 border-t border-surface-border"><RichBody body={l.body} /></div>
        )}

        {view.quiz && (
          <div className="p-6 space-y-7">
            <p className="text-sm text-gray-600">Você precisa acertar pelo menos {view.quiz.passScore}% para concluir. Sua melhor nota até agora: {view.quiz.bestScore ?? 'ainda não há tentativa'}.</p>
            {view.quiz.questions.map((question, qi) => (
              <fieldset key={question.id} className="space-y-3">
                <legend className="font-medium text-gray-900">{qi + 1}. {question.question}</legend>
                <div className="grid gap-2">
                  {question.options.map((option, oi) => (
                    <label key={oi} className="flex items-start gap-3 rounded-xl border border-surface-border px-3 py-2.5 cursor-pointer hover:bg-surface-secondary">
                      <input type="radio" name={`quiz-${l.id}-${question.id}`} value={oi} checked={quizAnswers[question.id] === oi}
                        onChange={() => setQuizAnswers(prev => ({ ...prev, [question.id]: oi }))}
                        disabled={pending || done} className="mt-0.5" />
                      <span className="text-sm text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {!done && <button onClick={sendQuiz} disabled={pending || Object.keys(quizAnswers).length !== view.quiz.questions.length} className="btn-primary">Enviar respostas</button>}
            {quizResult && (
              <div className={cn('rounded-card border p-4 text-sm', quizResult.passed ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900')}>
                <p className="font-semibold">{quizResult.passed ? 'Teste aprovado!' : 'Ainda não atingiu a nota mínima.'} {quizResult.score}% - {quizResult.correct} de {quizResult.total} acertos.</p>
                {!quizResult.passed && <p className="mt-1">A nota mínima é {view.quiz.passScore}%. Revise a aula e tente novamente.</p>}
                {!!quizResult.review?.length && <div className="mt-3 space-y-2 text-gray-700">{quizResult.review.map((item, index) => <p key={item.questionId}>{item.right ? '✓' : '•'} Questão {index + 1}: {item.explanation ?? (item.right ? 'Correta.' : 'Revise este ponto da aula.')}</p>)}</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        {!done && !view.quiz ? (
          <button onClick={complete} disabled={pending} className="btn-primary">
            <Check className="w-4 h-4" /> Concluir aula (+{l.xp} XP)
          </button>
        ) : done ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 bg-green-50 rounded-pill px-4 py-2">
              <Check className="w-4 h-4" /> Aula concluída
            </span>
            <Link href={nextHref} className="btn-primary">
              {view.nextId ? 'Próxima aula' : 'Voltar à trilha'} <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={undo} disabled={pending} className="btn-ghost"><Undo2 className="w-3.5 h-3.5" /> Desfazer</button>
          </>
        ) : null}
        {view.prevId && <Link href={`/treinamento/${view.trackId}/aula/${view.prevId}`} className="btn-ghost ml-auto"><ArrowLeft className="w-3.5 h-3.5" /> Anterior</Link>}
      </div>

      {result && done && (
        <div className={cn('rounded-card border p-5', celebrate ? 'bg-gradient-navy text-white border-transparent' : 'bg-brand-50 border-brand-200')}>
          <p className={cn('font-semibold', celebrate ? 'text-lg' : 'text-sm text-gray-800')}>
            {result.trackCompleted
              ? (result.onTime ? '🏆 Trilha concluída dentro do prazo! Bônus de pontualidade!' : '🏆 Trilha concluída! Parabéns!')
              : result.moduleCompleted ? '🧩 Módulo concluído! Bônus de módulo!'
              : result.levelUp ? `🚀 Subiu de nível: ${result.level}!`
              : `+${result.xpGained} XP — muito bem!`}
          </p>
          {celebrate && <p className="text-sm text-white/80 mt-1">+{result.xpGained} XP no total{result.levelUp && result.level ? ` · novo nível: ${result.level}` : ''}</p>}
          {!!result.newBadges?.length && (
            <p className={cn('text-sm mt-2', celebrate ? 'text-white' : 'text-gray-700')}>
              Nova conquista: {result.newBadges.map(b => `${b.emoji} ${b.label}`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {celebrate && (
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-50">
          <style>{`@keyframes tr-fall{0%{transform:translateY(-10vh) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(540deg);opacity:0}}`}</style>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className="absolute text-2xl" style={{ left: `${(i * 37) % 100}%`, top: 0, animation: `tr-fall ${2.4 + (i % 5) * 0.4}s ease-in ${(i % 7) * 0.15}s forwards` }}>
              {CONFETTI[i % CONFETTI.length]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LinkBlock({ url, label }: { url: string; label: string }) {
  return (
    <div className="p-8 text-center">
      <a href={url} target="_blank" rel="noreferrer" className="btn-primary">{label} <ExternalLink className="w-4 h-4" /></a>
      <p className="text-xs text-gray-400 mt-2 break-all">{url}</p>
    </div>
  )
}
