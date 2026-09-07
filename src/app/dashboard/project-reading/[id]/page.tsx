import { getPlan } from '@/lib/project-reading/actions'
import { ProjectReadingWorkspace } from '@/components/project-reading/ProjectReadingWorkspace'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leitura de Projeto — Luknos' }

export default async function ProjectReadingDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const data = await getPlan(params.id)
  if (!data) notFound()

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/project-reading" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">{data.plan.name}</h1>
      </div>
      <div className="flex-1 min-h-0">
        <ProjectReadingWorkspace
          plan={data.plan as any}
          environments={data.environments as any[]}
          legendItems={data.legendItems as any[]}
          symbols={data.symbols as any[]}
          measurements={data.measurements as any[]}
          annotations={data.annotations as any[]}
          powerSupplies={data.powerSupplies as any[]}
        />
      </div>
    </div>
  )
}
