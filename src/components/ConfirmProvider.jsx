import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmContext } from '../contexts/feedbackContexts'

const initialDialog = {
  title: '',
  description: '',
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  destructive: true,
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const cancelButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const openerRef = useRef(null)
  const pendingResolveRef = useRef(null)

  const closeDialog = useCallback((result) => {
    const resolve = pendingResolveRef.current
    if (!resolve) return

    pendingResolveRef.current = null
    resolve(result)
    setDialog(null)
    setConfirmation('')
    setPassword('')

    window.setTimeout(() => {
      const opener = openerRef.current
      if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true })
      else document.getElementById('main-content')?.focus({ preventScroll: true })
    }, 0)
  }, [])

  const confirm = useCallback((options) => {
    if (pendingResolveRef.current) {
      return Promise.resolve(false)
    }

    openerRef.current = document.activeElement

    return new Promise((resolve) => {
      pendingResolveRef.current = resolve
      setDialog({
        ...initialDialog,
        ...options,
      })
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  useEffect(() => {
    if (!dialog) return undefined

    cancelButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog(false)
      }
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)')
        if (!buttons?.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        else if (!dialogRef.current.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [closeDialog, dialog])

  useEffect(() => {
    return () => {
      pendingResolveRef.current?.(false)
      pendingResolveRef.current = null
    }
  }, [])

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl shadow-black/40"
          >
            <h2 id="confirm-dialog-title" className="text-xl font-bold">
              {dialog.title}
            </h2>

            <p
              id="confirm-dialog-description"
              className="mt-3 text-sm leading-6 text-zinc-400"
            >
              {dialog.description}
            </p>

            {dialog.details}
            {dialog.confirmationText && (
              <label className="mt-4 block text-sm">
                Digite <strong className="break-words">{dialog.confirmationText}</strong> para confirmar
                <input autoComplete="off" aria-label="Confirmação da exclusão" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 p-3" />
              </label>
            )}
            {dialog.reauthenticate && (
              <label className="mt-4 block text-sm">
                Senha atual
                <input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 p-3" />
              </label>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                ref={cancelButtonRef}
                onClick={() => closeDialog(false)}
                className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
              >
                {dialog.cancelLabel}
              </button>

              <button
                type="button"
                disabled={Boolean((dialog.confirmationText && confirmation !== dialog.confirmationText) || (dialog.reauthenticate && !password))}
                onClick={() => closeDialog(dialog.reauthenticate ? { confirmed: true, password } : true)}
                className={`rounded-xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  dialog.destructive
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-yellow-500 text-zinc-950 hover:bg-yellow-400'
                }`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
