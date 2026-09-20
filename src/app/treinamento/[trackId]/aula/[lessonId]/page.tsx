import { notFound } from 'next/navigation'
import { getLessonView } from '@/lib/training/actions'
import { LessonPlayer } from '@/components/training/LessonPlayer'

export const dynamic = 'force-dynamic'

export default async function LessonPage({ params }: { params: { trackId: string; lessonId: string } }) {
  const view = await getLessonView(params.trackId, params.lessonId)
  if (!view) notFound()
  return <LessonPlayer key={view.lesson.id} view={view} />
}
