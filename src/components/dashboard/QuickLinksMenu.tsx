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
        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors flex items-center gap-2 text-gray-700"
        title="Links rápidos"
      >
        <Link2 className="w-5 h-5" />
      </button>

      {/* Dropdown Menu */}
      <div className="absolute right-0 mt-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="py-2">
          {QUICK_LINKS.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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
