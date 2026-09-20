'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { saveTrack } from '@/lib/training/actions'
import { useToast } from '@/components/ui/Toast'

export function NewTrackButton() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [f, setF] = useState({ emoji: '🎓', title: '', description: '', days: '' })

  function submit() {
    start(async () => {
      const res = await saveTrack({ title: f.title, emoji: f.emoji, description: f.description, target_days: f.days ? Number(f.days) : null })
      if (res.error) return toast.error('Não foi possível criar', res.error)
      router.push(`/treinamento/gestao/${res.id}`)
    })
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary"><Plus className="w-4 h-4" /> Nova trilha</button>
  return (
    <div className="card p-4 basis-full space-y-3">
      <div className="flex gap-3">
        <div className="w-20"><label className="label">Ícone</label><input className="input text-center" value={f.emoji} maxLength={4} onChange={e => setF({ ...f, emoji: e.target.value })} /></div>
        <div className="flex-1"><label className="label">Nome da trilha</label><input className="input" autoFocus placeholder="Ex: Estagiário projetista" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div className="w-32"><label className="label">Prazo (dias)</label><input className="input" type="number" min={1} placeholder="30" value={f.days} onChange={e => setF({ ...f, days: e.target.value })} /></div>
      </div>
      <div><label className="label">Descrição (opcional)</label><input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={pending} className="btn-primary">Criar e montar</button>
        <button onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
      </div>
    </div>
  )
}
