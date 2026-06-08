'use client'

import { useState } from 'react'
import { createSchedule } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

export function ScheduleForm({
  selectedDate,
  onClose,
  onSuccess,
}: {
  selectedDate: string
  onClose: () => void
  onSuccess: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    type: 'reuniao' as 'visita' | 'reuniao' | 'follow_up',
    quote_id: '',
    location: '',
    team_members: [] as string[],
    time: '09:00',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await createSchedule({
        title: formData.title,
        type: formData.type,
        quote_id: formData.quote_id || undefined,
        scheduled_date: selectedDate,
        scheduled_time: formData.time,
        location: formData.location,
        team_members: formData.team_members,
      })

      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        onSuccess()
      }
    } catch (err) {
      setError('Erro ao criar agendamento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Novo agendamento</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Título do agendamento
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Visita ao cliente"
            className="input w-full"
            required
          />
        </div>

        {/* Tipo e Hora */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <select
              value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value as any })}
              className="input w-full"
            >
              <option value="visita">Visita</option>
              <option value="reuniao">Reunião</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Horário
            </label>
            <input
              type="time"
              value={formData.time}
              onChange={e => setFormData({ ...formData, time: e.target.value })}
              className="input w-full"
              required
            />
          </div>
        </div>

        {/* Localização */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Localização
          </label>
          <input
            type="text"
            value={formData.location}
            onChange={e => setFormData({ ...formData, location: e.target.value })}
            placeholder="Ex: Rua das Flores, 123"
            className="input w-full"
          />
        </div>

        {/* Orçamento (opcional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Orçamento relacionado (opcional)
          </label>
          <input
            type="text"
            value={formData.quote_id}
            onChange={e => setFormData({ ...formData, quote_id: e.target.value })}
            placeholder="ID do orçamento"
            className="input w-full"
          />
          <p className="text-xs text-gray-500 mt-1">Deixe em branco se não há orçamento relacionado</p>
        </div>

        {/* Equipe */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Equipe participante
          </label>
          <input
            type="text"
            placeholder="Digite nomes separados por vírgula"
            onBlur={e => {
              if (e.target.value) {
                setFormData({
                  ...formData,
                  team_members: e.target.value.split(',').map(m => m.trim()),
                })
              }
            }}
            className="input w-full"
          />
          {formData.team_members.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.team_members.map((member, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
                >
                  {member}
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        team_members: formData.team_members.filter((_, idx) => idx !== i),
                      })
                    }
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar agendamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
