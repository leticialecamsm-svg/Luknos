'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeWithTime } from '@/lib/utils'

export interface SiteLead {
  id: string
  has_project: boolean
  wants_visit: boolean | null
  segment: 'residencial' | 'comercial'
  name: string
  phone: string
  status: 'novo' | 'em_contato' | 'convertido' | 'descartado'
  created_at: string
}

const statusLabels: Record<SiteLead['status'], string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  convertido: 'Convertido',
  descartado: 'Descartado',
}

const statusColors: Record<SiteLead['status'], string> = {
  novo: 'bg-amber-50 text-amber-700 border-amber-200',
  em_contato: 'bg-blue-50 text-blue-700 border-blue-200',
  convertido: 'bg-green-50 text-green-700 border-green-200',
  descartado: 'bg-gray-100 text-gray-500 border-gray-200',
}

function projectLabel(lead: SiteLead) {
  if (lead.has_project) return 'Já tem projeto'
  if (lead.wants_visit) return 'Sem projeto · quer visita'
  return 'Sem projeto · sem visita'
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

export function SiteLeadsView({ initialLeads }: { initialLeads: SiteLead[] }) {
  const [leads, setLeads] = useState<SiteLead[]>(initialLeads)
  const [filter, setFilter] = useState<'todos' | SiteLead['status']>('todos')

  const stats = {
    total: leads.length,
    novo: leads.filter((l) => l.status === 'novo').length,
    em_contato: leads.filter((l) => l.status === 'em_contato').length,
    convertido: leads.filter((l) => l.status === 'convertido').length,
  }

  const filtered = filter === 'todos' ? leads : leads.filter((l) => l.status === filter)

  async function updateStatus(id: string, status: SiteLead['status']) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
    const supabase = createClient()
    const { error } = await supabase.from('site_leads').update({ status }).eq('id', id)
    if (error) {
      console.error('Erro ao atualizar status:', error.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Contatos do site</h2>
          <p className="text-sm text-gray-500 mt-1">
            {stats.total} solicitações recebidas pelo formulário do site
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['todos', 'novo', 'em_contato', 'convertido', 'descartado'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filter === f
                  ? 'border-brand-600 bg-brand-50 text-brand-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'todos' ? 'Todos' : statusLabels[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Total</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Novos</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{stats.novo}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Em contato</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats.em_contato}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Convertidos</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{stats.convertido}</p>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400">
          Nenhuma solicitação por aqui ainda.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Nome</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Telefone</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Segmento</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Projeto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-900">Recebido</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-900">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-900">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{lead.name}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium capitalize">
                        {lead.segment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{projectLabel(lead)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatRelativeWithTime(lead.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={lead.status}
                        onChange={(e) => updateStatus(lead.id, e.target.value as SiteLead['status'])}
                        className={`text-xs font-semibold px-2 py-1 rounded border outline-none ${statusColors[lead.status]}`}
                      >
                        {(Object.keys(statusLabels) as SiteLead['status'][]).map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a
                        href={whatsappLink(lead.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                        title="Falar no WhatsApp"
                      >
                        <MessageCircle size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
