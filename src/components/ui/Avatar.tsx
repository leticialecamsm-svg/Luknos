import { getInitials, cn } from '@/lib/utils'

interface AvatarUser {
  name?: string | null
  avatar_color?: string | null
  avatar_url?: string | null
}

const SIZE_PX: Record<string, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
}

/**
 * Avatar reutilizável: mostra a foto (avatar_url) quando existir,
 * senão cai no fallback de iniciais + cor de fundo.
 *
 * `size` aceita um preset (xs/sm/md/lg) ou um número de pixels.
 */
export function Avatar({
  user,
  size = 'md',
  className,
  title,
}: {
  user: AvatarUser
  size?: 'xs' | 'sm' | 'md' | 'lg' | number
  className?: string
  title?: string
}) {
  const px = typeof size === 'number' ? size : SIZE_PX[size] ?? SIZE_PX.md
  const name = user.name ?? '?'
  const fontSize = Math.max(9, Math.round(px * 0.4))

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={name}
        title={title ?? name}
        width={px}
        height={px}
        className={cn('rounded-full object-cover shrink-0', className)}
        style={{ width: px, height: px }}
      />
    )
  }

  return (
    <div
      title={title ?? name}
      className={cn('rounded-full flex items-center justify-center text-white font-bold shrink-0', className)}
      style={{ width: px, height: px, fontSize, backgroundColor: user.avatar_color ?? '#185FA5' }}
    >
      {getInitials(name)}
    </div>
  )
}
