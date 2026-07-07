import { getMarketingPosts, getEditorialLines, getActiveUsers } from '@/lib/actions'
import { MarketingWorkspace } from '@/components/marketing/MarketingWorkspace'

export const dynamic = 'force-dynamic'

export default async function MarketingPage() {
  const [posts, editorialLines, users] = await Promise.all([
    getMarketingPosts(),
    getEditorialLines(),
    getActiveUsers(),
  ])

  return (
    <MarketingWorkspace
      initialPosts={posts}
      editorialLines={editorialLines}
      users={users}
    />
  )
}
