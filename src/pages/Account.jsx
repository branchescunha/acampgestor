import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import {
  accountEmail,
  accountManagementEnabled,
  accountSelfEmailEnabled,
  validateAccountName,
  validateAccountEmail,
  validateAccountPassword,
} from '../features/auth/account'
import { invokeAccountAction } from '../features/auth/accountClient'
import { markFormSaved } from '../utils/navigation'

const inputClass =
  'mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3'

export default function Account() {
  const { session } = useAuthContext()
  const { profile, isAdmin, isGestor, isActive } = useUserProfile()
  const [authUser, setAuthUser] = useState(null)
  const [name, setName] = useState(null)
  const [email, setEmail] = useState(null)
  const [selfEmailEnabled, setSelfEmailEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const guard = useRef(false)
  const userId = session?.user?.id

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const { data, error: identityError } = await supabase.auth.getUser()
        if (identityError || data?.user?.id !== userId)
          throw new Error('identity')
        if (mounted) setAuthUser(data.user)
        if (accountManagementEnabled && isGestor) {
          const capabilities = await invokeAccountAction(supabase, {
            action: 'capabilities',
          })
          if (mounted)
            setSelfEmailEnabled(
              accountSelfEmailEnabled && capabilities.selfEmailEnabled === true
            )
        }
      } catch {
        if (mounted)
          setError(
            'Não foi possível confirmar todos os dados da conta. Tente atualizar a página.'
          )
      }
    }
    if (userId) void load()
    return () => {
      mounted = false
    }
  }, [userId, isGestor, session])

  const realEmail = accountEmail(authUser || session?.user)
  const displayName = name ?? profile?.name ?? ''

  async function save(event, kind) {
    event.preventDefault()
    const form = event.currentTarget
    if (guard.current || !isActive || !userId) return
    const validation =
      kind === 'password'
        ? validateAccountPassword(password, confirmPassword)
        : kind === 'name'
          ? validateAccountName(displayName)
          : validateAccountEmail(email ?? realEmail)
    setError('')
    setSuccess('')
    if (validation) {
      setError(validation)
      return
    }
    if (kind === 'name' && !(isAdmin || (isGestor && accountManagementEnabled)))
      return
    if (
      kind === 'email' &&
      !(isGestor && accountManagementEnabled && selfEmailEnabled)
    )
      return
    guard.current = true
    setBusy(true)
    try {
      if (kind === 'name') {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            name: displayName.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id')
          .single()
        if (updateError) throw updateError
        setName(displayName.trim())
        window.dispatchEvent(new Event('acampgestor:profile-updated'))
        setSuccess('Nome atualizado com sucesso.')
      } else if (kind === 'email') {
        const nextEmail = (email ?? realEmail).trim().toLowerCase()
        const { data, error: updateError } = await supabase.auth.updateUser(
          { email: nextEmail },
          { emailRedirectTo: window.location.origin + window.location.pathname }
        )
        if (updateError) throw updateError
        setAuthUser(data.user)
        setEmail(null)
        setSuccess(
          data.user.email?.toLowerCase() === nextEmail
            ? 'E-mail de acesso atualizado.'
            : 'Solicitação enviada. Confirme a alteração nos e-mails indicados pelo Supabase. O e-mail atual continua válido até a confirmação.'
        )
      } else {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        })
        if (updateError) throw updateError
        setPassword('')
        setConfirmPassword('')
        setSuccess('Senha alterada com sucesso.')
      }
      markFormSaved(form)
    } catch {
      setError(
        kind === 'email'
          ? 'Não foi possível alterar o e-mail. Verifique conflito, confirmação ou disponibilidade do envio. O endereço exibido só muda após confirmação pelo Auth.'
          : 'Não foi possível salvar a alteração. Verifique sua sessão e tente novamente.'
      )
    } finally {
      guard.current = false
      setBusy(false)
    }
  }

  return (
    <section>
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-yellow-500">
          Conta
        </p>
        <h1 className="mt-3 text-3xl font-bold">Configurações da conta</h1>
        <p className="mt-3 text-zinc-400">
          Gerencie seus dados e sua senha no AcampGestor.
        </p>
      </header>
      {error && (
        <p role="alert" className="mt-5 text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-5 text-green-400">
          {success}
        </p>
      )}
      <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-2">
        <div className="min-w-0 space-y-8">
          <form onSubmit={(event) => save(event, 'name')} className="space-y-4">
            <h2 className="text-xl font-semibold">Dados pessoais</h2>
            <label className="block text-sm" htmlFor="account-name">
              Nome
            </label>
            <input
              id="account-name"
              name="name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              readOnly={!(isAdmin || accountManagementEnabled)}
              className={inputClass}
            />
            {(isAdmin || accountManagementEnabled) && (
              <button type="submit" disabled={busy} className="record-action">
                Salvar nome
              </button>
            )}
          </form>
          <form
            onSubmit={(event) => save(event, 'email')}
            className="space-y-4"
          >
            <label className="block text-sm" htmlFor="account-email">
              E-mail de acesso
            </label>
            <input
              id="account-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email ?? realEmail}
              onChange={(event) => setEmail(event.target.value)}
              readOnly={
                !(isGestor && accountManagementEnabled && selfEmailEnabled)
              }
              className={inputClass}
            />
            {isAdmin ? (
              <p className="text-sm text-zinc-400">
                O e-mail da conta ADMIN é somente leitura.
              </p>
            ) : selfEmailEnabled ? (
              <button type="submit" disabled={busy} className="record-action">
                Solicitar alteração de e-mail
              </button>
            ) : (
              <p className="text-sm text-zinc-400">
                Para corrigir o e-mail de acesso, procure o administrador. A
                alteração por confirmação de e-mail ainda não está disponível.
              </p>
            )}
            {authUser?.new_email && (
              <p role="status" className="break-all text-sm text-zinc-400">
                Alteração de e-mail aguardando confirmação.
              </p>
            )}
          </form>
        </div>
        <form
          onSubmit={(event) => save(event, 'password')}
          className="min-w-0 space-y-4"
        >
          <h2 className="text-xl font-semibold">Alterar senha</h2>
          <label className="block text-sm" htmlFor="account-new-password">
            Nova senha
          </label>
          <input
            id="account-new-password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          <label className="block text-sm" htmlFor="account-confirm-password">
            Confirmar nova senha
          </label>
          <input
            id="account-confirm-password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="record-action bg-yellow-500 text-zinc-950"
          >
            {busy ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </section>
  )
}
