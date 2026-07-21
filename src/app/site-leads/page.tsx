import { createClient } from '@/lib/supabase/server'
import { SiteLeadsView } from '@/components/site-leads/SiteLeadsView'

export default async function SiteLeadsPage() {
  const supabase = createClient()
  const { data: leads } = await supabase
    .from('site_leads')
    .select('*')
    .order('created_at', { ascending: false })

  return <SiteLeadsView initialLeads={leads ?? []} />
}
