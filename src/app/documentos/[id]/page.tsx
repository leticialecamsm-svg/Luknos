import { notFound } from 'next/navigation'
import { getDocument } from '@/lib/documents/actions'
import { DocumentDetailClient } from '@/components/documents/DocumentDetailClient'

export const dynamic = 'force-dynamic'

export default async function DocumentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doc = await getDocument(id)
  if (!doc) notFound()
  return <DocumentDetailClient doc={doc} />
}
