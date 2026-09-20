import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock3, Eye, FileQuestion, Lightbulb } from 'lucide-react'
import { getTrainingHome } from '@/lib/training/actions'
import { LIGHTING_COURSE } from '@/lib/training/lighting-course'
import { fmtMin } from '@/components/training/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prévia do curso de iluminação — Luknos' }

export default async function LightingCoursePreviewPage() {
  const data = await getTrainingHome()
  if (!data?.isAdmin) redirect('/treinamento')
  const lessons = LIGHTING_COURSE.modules.flatMap(module => module.lessons)
  const totalMinutes = lessons.reduce((total, lesson) => total + lesson.duration_min, 0)
  const quizzes = lessons.filter(lesson => lesson.quiz_data)

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/treinamento/gestao" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2"><ArrowLeft className="w-4 h-4" /> Gestão de treinamentos</Link>
          <p className="eyebrow">Prévia de revisão</p>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">💡 {LIGHTING_COURSE.title}</h1>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl">Aqui você lê exatamente o conteúdo do colaborador. Os gabaritos aparecem somente nesta prévia; na trilha publicada, o aluno vê apenas as alternativas e a explicação após responder.</p>
        </div>
        <Link href="/treinamento/gestao" className="btn-secondary"><Lightbulb className="w-4 h-4" /> Voltar para instalar</Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card p-4"><p className="text-xs text-gray-500">Módulos</p><p className="text-2xl font-semibold mt-1">{LIGHTING_COURSE.modules.length}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Aulas para leitura</p><p className="text-2xl font-semibold mt-1">{lessons.length}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500">Tempo estimado</p><p className="text-2xl font-semibold mt-1">{fmtMin(totalMinutes)}</p></div>
      </div>

      <div className="rounded-card border border-brand-200 bg-brand-50 p-4 text-sm text-gray-700 flex gap-3">
        <Eye className="w-5 h-5 text-brand-700 shrink-0" />
        <p>Revise a linguagem, exemplos, ordem e perguntas. Quando estiver satisfeita, vá em <strong>Gestão de treinamentos → Instalar curso de iluminação</strong>. A trilha entra como rascunho e só aparece para a equipe após você publicar e atribuir.</p>
      </div>

      <div className="space-y-4">
        {LIGHTING_COURSE.modules.map((module, moduleIndex) => (
          <section key={module.title} className="card overflow-hidden">
            <div className="px-5 py-4 bg-surface-secondary border-b border-surface-border">
              <p className="text-xs font-semibold text-brand-700">MÓDULO {moduleIndex + 1}</p>
              <h2 className="font-semibold text-gray-900 mt-1">{module.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{module.description}</p>
            </div>
            <div className="divide-y divide-surface-border">
              {module.lessons.map((lesson, lessonIndex) => (
                <details key={lesson.title} className="group" open={moduleIndex === 0 && lessonIndex === 0}>
                  <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 hover:bg-surface-secondary">
                    {lesson.quiz_data ? <FileQuestion className="w-4 h-4 text-brand-600 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="flex-1 text-sm font-medium text-gray-900">{lesson.title}</span>
                    <span className="text-xs text-gray-400 inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {fmtMin(lesson.duration_min)}</span>
                    <span className="text-xs text-gray-400 group-open:rotate-90 transition-transform">›</span>
                  </summary>
                  <div className="px-5 pb-6 border-t border-surface-border">
                    <article className="whitespace-pre-wrap text-sm leading-7 text-gray-700 pt-5 max-w-3xl">{lesson.body}</article>
                    {lesson.quiz_data && (
                      <div className="mt-6 space-y-4 rounded-card border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-900">Gabarito da gestora - não aparece ao colaborador</p>
                        {lesson.quiz_data.questions.map((question, questionIndex) => (
                          <div key={question.prompt} className="text-sm text-gray-700">
                            <p className="font-medium">{questionIndex + 1}. {question.prompt}</p>
                            <ol className="mt-1 pl-5 list-[upper-alpha]">
                              {question.options.map((option, optionIndex) => <li key={option} className={optionIndex === question.answer ? 'font-semibold text-green-800' : ''}>{option}{optionIndex === question.answer ? ' - correta' : ''}</li>)}
                            </ol>
                            <p className="mt-1 text-xs text-gray-600"><strong>Explicação:</strong> {question.explanation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="text-xs text-gray-500">{quizzes.length} testes com nota mínima de 70%. O módulo Masterlojista permanece reservado para os seus vídeos e procedimentos internos.</div>
    </div>
  )
}
