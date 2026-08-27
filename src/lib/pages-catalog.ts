// Lista de páginas que podem ser liberadas por papel em /admin/users.
// Mantida em sincronia manualmente com o NAV/ADMIN_NAV do Sidebar.
export const PAGE_CATALOG: { href: string; label: string }[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/tasks', label: 'Tarefas' },
  { href: '/schedules', label: 'Agenda' },
  { href: '/quotes', label: 'Orçamentos' },
  { href: '/negotiations', label: 'Negociações' },
  { href: '/site-leads', label: 'Contatos do Site' },
  { href: '/shipping', label: 'Expedição' },
  { href: '/partners', label: 'Parceiros' },
  { href: '/metropolitano', label: 'Metropolitano (pontuação)' },
  { href: '/marketing', label: 'Marketing' },
  { href: '/finance', label: 'Financeiro' },
  { href: '/hr', label: 'RH' },
  { href: '/purchases', label: 'Notas de Entrada' },
]
