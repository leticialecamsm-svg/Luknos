import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPolicyView } from '@/lib/policies/actions'
import { TopicReader } from '@/components/policies/TopicReader'

export default async function PolicyPage({ params }: { params: { id: string } }) {
  const view = await getPolicyView(params.id)
  if (!view) notFound()

  return (
    <div className="space-y-5">
      <Link href="/politicas" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Políticas
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">{view.title}</h1>
        {view.description && <p className="text-sm text-gray-500 mt-1">{view.description}</p>}
        <p className="text-xs text-gray-400 mt-2">Abra cada tópico, leia até o final e confirme. Os tópicos são liberados em ordem.</p>
      </div>

      <TopicReader topics={view.topics} documentFullySigned={view.fullySigned} />
    </div>
  )
}
