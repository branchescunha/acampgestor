import { useRef, useState } from 'react'
import { useConfirm } from './useConfirm'
import { useToast } from './useToast'
import { connectionMessage } from '../utils/network'

export function useRecordAction() {
  const guard = useRef(false)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const { showError, showSuccess } = useToast()
  async function run(options, operation, success) {
    if (guard.current) return false
    guard.current = true
    setBusy(true)
    try {
      if (options && !(await confirm(options))) return false
      await operation()
      showSuccess(success)
      return true
    } catch (error) {
      showError(
        error.code === '23503'
          ? 'Este registro possui vínculos ou histórico. Inative-o em vez de excluir.'
          : connectionMessage(error)
      )
      return false
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return { run, busy }
}
