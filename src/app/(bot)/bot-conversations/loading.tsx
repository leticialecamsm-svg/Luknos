import { PageHeaderSkeleton, CardsSkeleton, TableSkeleton } from '@/components/bot/skeletons'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="max-w-lg">
        <CardsSkeleton n={3} />
      </div>
      <TableSkeleton rows={8} />
    </div>
  )
}
