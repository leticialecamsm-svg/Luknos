import { notFound, redirect } from 'next/navigation'
import { getAdminTrack, listAssignableUsers } from '@/lib/training/actions'
import { TrackEditor } from '@/components/training/TrackEditor'

export const dynamic = 'force-dynamic'

export default async function EditTrackPage({ params }: { params: { trackId: string } }) {
  const [detail, users] = await Promise.all([getAdminTrack(params.trackId), listAssignableUsers()])
  if (!detail) {
    // getAdminTrack devolve null tanto para "não é admin" quanto "não existe"
    if (!users.length) redirect('/treinamento')
    notFound()
  }
  return <TrackEditor detail={detail} users={users as { id: string; name: string; role: string }[]} />
}
