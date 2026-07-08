import { getMarketingPosts, getEditorialLines } from '@/lib/actions'
import { EditorialLinesPage } from '@/components/marketing/EditorialLinesPage'

export const dynamic = 'force-dynamic'

export default async function MarketingEditorialPage() {
  const [posts, editorialLines] = await Promise.all([
    getMarketingPosts(),
    getEditorialLines(),
  ])

  return <EditorialLinesPage initialLines={editorialLines} posts={posts} />
}
