// Skeletons compartilhados pelos loading.tsx das páginas do robô.

function Bar({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded bg-gray-200/70 animate-pulse`} />
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Bar w="w-48" h="h-7" />
      <Bar w="w-80 max-w-full" h="h-4" />
    </div>
  )
}

export function CardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card p-4 space-y-2">
          <Bar w="w-12" h="h-7" />
          <Bar w="w-24" h="h-3" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-surface-border bg-surface px-4 py-3">
        <Bar w="w-40" h="h-3" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-surface-border last:border-0 px-4 py-3.5"
        >
          <Bar w="w-1/4" />
          <Bar w="w-20" />
          <Bar w="w-1/5" />
          <Bar w="w-24" />
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="card p-5 space-y-4">
          <Bar w="w-52" h="h-5" />
          <Bar w="w-full max-w-md" h="h-9" />
          <Bar w="w-full max-w-sm" h="h-9" />
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} w={i % 2 ? 'w-2/3 ml-auto' : 'w-1/2'} h="h-10" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="card p-5 space-y-3">
            <Bar w="w-24" h="h-5" />
            <Bar h="h-12" />
            <Bar h="h-12" />
          </div>
          <div className="card p-5 space-y-2">
            <Bar w="w-32" h="h-5" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Bar key={i} h="h-3" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
