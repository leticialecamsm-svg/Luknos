'use client'

import { CORES_LUZ, MONTAGENS } from '@/lib/project-reading/cad-legend'
import type { Spec } from '@/lib/project-reading/cad-state'

const campo = 'w-full text-sm border border-gray-200 rounded px-2 py-1 text-gray-800 bg-white'

/** Campos de especificação de um item (nome, instalação, potência, cor da luz). */
export function CadSpecFields({ value, onChange, showPower = true }: { value: Spec; onChange: (v: Spec) => void; showPower?: boolean }) {
  const set = (patch: Partial<Spec>) => onChange({ ...value, ...patch })
  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-gray-500">Nome
        <input autoFocus value={value.name} onChange={e => set({ name: e.target.value })} onKeyDown={e => e.stopPropagation()} className={campo} /></label>
      <div className="flex gap-2">
        <label className="flex-1 text-[11px] text-gray-500">Instalação
          <select value={value.mounting} onChange={e => set({ mounting: e.target.value })} className={campo}>
            {MONTAGENS.map(m => <option key={m} value={m}>{m || '—'}</option>)}
          </select></label>
        {showPower && (
          <label className="w-24 text-[11px] text-gray-500">Potência
            <input value={value.power} onChange={e => set({ power: e.target.value })} onKeyDown={e => e.stopPropagation()} placeholder="ex. 18W" className={campo} /></label>
        )}
        <label className="w-24 text-[11px] text-gray-500">Cor da luz
          <input list="cad-cores-luz" value={value.light} onChange={e => set({ light: e.target.value })} onKeyDown={e => e.stopPropagation()} placeholder="ex. 3000K" className={campo} />
          <datalist id="cad-cores-luz">{CORES_LUZ.filter(Boolean).map(c => <option key={c} value={c} />)}</datalist></label>
      </div>
    </div>
  )
}
