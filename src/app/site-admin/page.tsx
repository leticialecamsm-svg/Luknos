import { createClient } from '@/lib/supabase/server'
import { SiteBrandsManager } from '@/components/site-admin/SiteBrandsManager'

// Gerenciador do site público (luknosiluminacao.com.br). Por enquanto só a aba
// Especificadores — o site lê a tabela site_brands direto do Supabase.
export default async function SiteAdminPage() {
  const supabase = createClient()
  const { data: brands } = await supabase
    .from('site_brands')
    .select('*')
    .order('sort_order')
    .order('name')

  return <SiteBrandsManager initialBrands={brands ?? []} />
}
