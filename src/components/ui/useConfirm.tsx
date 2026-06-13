'use client'

import { useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

export function useConfirm() {
  const [state, setState] = useState<{
    message: string
    confirmLabel?: string
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = (message: string, confirmLabel?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ message, confirmLabel, resolve })
    })
  }

  const handleConfirm = () => {
    state?.resolve(true)
    setState(null)
  }

  const handleCancel = () => {
    state?.resolve(false)
    setState(null)
  }

  const ConfirmDialog = state ? (
    <ConfirmModal
      message={state.message}
      confirmLabel={state.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmDialog }
}
