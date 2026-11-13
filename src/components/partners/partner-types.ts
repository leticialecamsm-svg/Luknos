export const TYPE_LABEL: Record<string, string> = {
  architect: 'Arquiteto',
  engineer: 'Engenheiro',
  designer: 'Designer',
  electrician: 'Eletricista',
  plasterer: 'Gesseiro',
  carpenter: 'Marceneiro',
  client: 'Cliente',
  other: 'Outro',
}

export const TYPE_COLOR: Record<string, string> = {
  architect: 'bg-blue-50 text-blue-700',
  engineer: 'bg-amber-50 text-amber-700',
  designer: 'bg-purple-50 text-purple-700',
  electrician: 'bg-yellow-50 text-yellow-700',
  plasterer: 'bg-pink-50 text-pink-700',
  carpenter: 'bg-orange-50 text-orange-700',
  client: 'bg-green-50 text-green-700',
  other: 'bg-gray-100 text-gray-600',
}

export const TYPE_KEYS = ['architect', 'engineer', 'designer', 'electrician', 'plasterer', 'carpenter', 'client'] as const

export interface AppUser { id: string; name: string; avatar_color?: string | null; avatar_url?: string | null }

export interface Contact {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  type: string
  company?: string | null
  new_prospection?: boolean
  prospection_date?: string | null
  created_at?: string
  created_by?: string
  assigned_to?: string | null
  assigned_user?: AppUser | null
  creator?: AppUser | null
  commission_rate?: number | null
  linked_user_id?: string | null
}

// O que o formulário devolve ao salvar.
export interface PartnerFormValues {
  name: string
  type: string
  phone: string
  email: string
  company: string
  assigned_to: string
  new_prospection: boolean
  commission_rate: number | null | undefined
  linked_user_id: string | null | undefined
  cpf: string
  pix_key: string
  birth_date: string // AAAA-MM-DD
  address: string
  // false quando a seção de cadastro estava oculta/carregando: aí não se mexe nesses dados
  sensitiveVisible: boolean
}

export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
