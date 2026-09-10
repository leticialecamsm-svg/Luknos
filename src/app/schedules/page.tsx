import { redirect } from 'next/navigation'

// A Agenda virou uma aba da página de Tarefas — essa rota antiga continua
// existindo só pra não quebrar links salvos e o histórico do navegador.
export default function SchedulesPage() {
  redirect('/dashboard/tasks?view=agenda')
}
