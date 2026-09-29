'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { savePolicyDocument } from '@/lib/policies/actions'
import { useToast } from '@/components/ui/Toast'

export function NewPolicyButton() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (!title.trim()) return toast.error('Dê um título ao documento')
    start(async () => {
      const res = await savePolicyDocument({ title })
      if (res.error) return toast.error('Não foi possível criar', res.error)
      toast.success('Documento criado')
      router.push(`/politicas/gestao/${res.id}`)
    })
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary"><Plus className="w-4 h-4" /> Novo documento</button>

  return (
    <div className="card p-4 basis-full space-y-3">
      <div className="flex gap-3">
        <input className="input flex-1" autoFocus placeholder="Ex: Uso de computadores, internet e celulares" value={title}
          onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} onClick={submit}>Criar</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  )
}
