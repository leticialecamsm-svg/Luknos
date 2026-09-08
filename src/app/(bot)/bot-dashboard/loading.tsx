import { PageHeaderSkeleton, CardsSkeleton } from '@/components/bot/skeletons'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <CardsSkeleton n={4} />
      <div className="card p-5 h-56 animate-pulse bg-gray-100/50" />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5 h-40 animate-pulse bg-gray-100/50" />
        <div className="card p-5 h-40 animate-pulse bg-gray-100/50" />
      </div>
    </div>
  )
}
