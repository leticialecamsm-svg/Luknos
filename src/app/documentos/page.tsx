import { getDocuments } from '@/lib/documents/actions'
import { DocumentsClient } from '@/components/documents/DocumentsClient'

export const dynamic = 'force-dynamic'

export default async function DocumentosPage() {
  const docs = await getDocuments()
  return <DocumentsClient initialDocs={docs} />
}
