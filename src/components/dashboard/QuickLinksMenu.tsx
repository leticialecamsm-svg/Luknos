'use client'

import { useState } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'

const QUICK_LINKS = [
  {
    label: 'Sistema ERP',
    url: 'https://luknos.masterlojista.com.br',
    icon: '🖥️'
  },
  {
    label: 'Planilha de Preços',
    url: 'https://docs.google.com/spreadsheets/d/1Hg57WE_yCjm-Iu2wruBokscAs0KqZhlMo_Nv_6vgjKw/edit?gid=539967209#gid=539967209',
    icon: '📊'
  },
  {
    label: 'Drive',
    url: 'https://drive.google.com/drive/folders/1XqZ-EnWYkzSCilBDGRMU9IQTzr4tGqEl',
    icon: '📁'
  }
]

export function QuickLinksMenu() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative group">
      <button
        className="px-3 py-2 rounded-pill bg-surface-secondary hover:bg-[rgba(10,31,59,0.06)] transition-colors flex items-center gap-2 text-navy text-sm font-medium"
        title="Links rápidos"
      >
        <Link2 className="w-4 h-4" />
        <span>Links úteis</span>
      </button>

      {/* Dropdown Menu */}
      <div className="absolute right-0 mt-0 w-56 bg-white border border-surface-border rounded-card shadow-card opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="py-2">
          {QUICK_LINKS.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-navy hover:bg-surface-secondary transition-colors"
            >
              <span className="text-lg">{link.icon}</span>
              <span className="flex-1">{link.label}</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
