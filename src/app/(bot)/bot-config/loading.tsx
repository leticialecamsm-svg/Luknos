import { PageHeaderSkeleton, FormSkeleton } from '@/components/bot/skeletons'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FormSkeleton sections={3} />
    </div>
  )
}
