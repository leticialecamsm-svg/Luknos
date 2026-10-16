'use client'

import { useState, type ReactNode } from 'react'

export type TabItem = {
  id: string
  label: string
  badge?: number
  icon?: any
  content: ReactNode
}

export function Tabs({
  items,
  defaultTab,
  active: controlledActive,
  onChange,
  className,
  hideTabBar = false,
}: {
  items: TabItem[]
  defaultTab?: string
  active?: string
  onChange?: (id: string) => void
  className?: string
  hideTabBar?: boolean
}) {
  const [inner, setInner] = useState(defaultTab ?? items[0]?.id)
  const active = controlledActive ?? inner
  const setActive = (id: string) => { setInner(id); onChange?.(id) }
  const activeItem = items.find(i => i.id === active) ?? items[0]
  const activeIdx = items.findIndex(i => i.id === active)
  const ActiveIcon = activeItem?.icon

  return (
    <div className={className}>
      {/* Linha de abas — ocultada quando hideTabBar=true (pipeline já navega) */}
      {!hideTabBar && (
        <div className="flex items-end flex-wrap" style={{ paddingLeft: 2, gap: '3px 3px' }}>
          {items.map((item) => {
            const isActive = item.id === active
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                style={isActive ? {
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 15px 10px',
                  borderRadius: '14px 14px 0 0',
                  fontSize: 12, fontWeight: 600,
                  background: '#fff', color: '#0a1f3b',
                  border: '1px solid rgba(10,31,59,.08)', borderBottom: 'none',
                  marginBottom: -1, position: 'relative', zIndex: 2,
                } : {
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 11.5, fontWeight: 500,
                  background: 'rgba(255,255,255,.7)', color: '#4f596b',
                  border: '1px solid rgba(10,31,59,.1)',
                  marginBottom: 6,
                }}
              >
                {isActive && Icon && (
                  <Icon style={{ width: 13, height: 13, color: '#cba455', flexShrink: 0 }} />
                )}
                {item.label}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, lineHeight: 1.4,
                    background: isActive ? 'rgba(10,31,59,.07)' : '#f3f4f6',
                    color: isActive ? '#0a1f3b' : '#6b7280',
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {/* Quando a barra está oculta, mostra título estático da aba ativa */}
      {hideTabBar && activeItem && (
        <div className="flex items-center gap-2 mb-3 px-0.5">
          {ActiveIcon && <ActiveIcon style={{ width: 14, height: 14, color: '#cba455', flexShrink: 0 }} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0a1f3b' }}>{activeItem.label}</span>
          {typeof activeItem.badge === 'number' && activeItem.badge > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'rgba(10,31,59,.07)', color: '#0a1f3b' }}>
              {activeItem.badge}
            </span>
          )}
        </div>
      )}
      {/* Conteúdo */}
      <div style={{
        border: '1px solid rgba(10,31,59,.08)',
        borderRadius: (!hideTabBar && activeIdx === 0) ? '0 22px 22px 22px' : '22px',
        background: 'linear-gradient(180deg,#fff 0%,#fdfdfc 100%)',
        padding: 20,
        boxShadow: 'rgba(10,31,59,.05) 0 2px 8px 0, rgba(10,31,59,.12) 0 22px 44px -26px',
      }}>
        {activeItem?.content}
      </div>
    </div>
  )
}
