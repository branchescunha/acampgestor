import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import ResponsiveTable from '../components/ResponsiveTable'
import RecordActions from '../components/RecordActions'
import { useUserProfile } from '../hooks/useUserProfile'
import { useRecordAction } from '../hooks/useRecordAction'
import { supabase } from '../lib/supabase'
import { connectionMessage } from '../utils/network'
import { useReadRetry } from '../hooks/useReadRetry'
import { useAuthContext } from '../hooks/useAuth'
import {
  accountManagementEnabled,
  validateAccountEmail,
  validateAccountPassword,
} from '../features/auth/account'
import { invokeAccountAction } from '../features/auth/accountClient'

export default function Users() {
  const { isAdmin } = useUserProfile()
  const { session } = useAuthContext()
  const [profiles, setProfiles] = useState([])
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { run, busy } = useRecordAction()

  const loadProfiles = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    if (accountManagementEnabled) {
      try {
        const { users } = await invokeAccountAction(supabase, {
          action: 'list-users',
        })
        setProfiles(users)
        setError('')
      } catch (loadError) {
        setError(loadError.message)
      }
      setLoading(false)
      return
    }
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .order('name')
    const { data: authData } = await supabase.auth.getUser()
    const ownEmail =
      authData?.user?.id === session?.user?.id
        ? authData.user.email
        : session?.user?.email
    setError(loadError ? connectionMessage(loadError) : '')
    if (!loadError)
      setProfiles(
        (data || []).map((profile) => ({
          ...profile,
          email: profile.id === session?.user?.id ? ownEmail : profile.email,
        }))
      )
    setLoading(false)
  }, [isAdmin, session])

  useReadRetry(loadProfiles)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadProfiles])

  function edit(profile) {
    setEditing(profile)
    setName(profile.name || '')
    setEmail(profile.email || '')
    setPassword('')
    setConfirmation('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function changeAccess(action) {
    if (!isAdmin || !accountManagementEnabled || editing?.role !== 'gestor')
      return
    const invalid =
      action === 'update-email'
        ? validateAccountEmail(email)
        : validateAccountPassword(password, confirmation)
    if (invalid) {
      setError(invalid)
      return
    }
    setError('')
    const done = await run(
      {
        title:
          action === 'update-email'
            ? `Corrigir e-mail de ${editing.name}?`
            : `Substituir senha de ${editing.name}?`,
        description:
          action === 'update-email'
            ? 'Confirme a identidade do gestor antes de continuar. O endereço será alterado no Auth sem envio de confirmação. O UID, o papel, o status e o histórico serão preservados.'
            : 'A senha anterior será substituída, sem ser exibida. O status de acesso será preservado. Entregue a nova senha ao gestor por um canal seguro.',
        confirmLabel:
          action === 'update-email' ? 'Confirmar correção' : 'Substituir senha',
      },
      async () => {
        try {
          await invokeAccountAction(supabase, {
            action,
            targetId: editing.id,
            confirmed: true,
            ...(action === 'update-email' ? { email } : { password }),
          })
        } catch (operationError) {
          setError(operationError.message)
          throw operationError
        }
      },
      action === 'update-email'
        ? 'E-mail de acesso corrigido.'
        : 'Senha anterior substituída. O status de acesso foi preservado.'
    )
    if (done) {
      setPassword('')
      setConfirmation('')
      await loadProfiles()
    }
  }

  async function save(event) {
    event.preventDefault()
    if (!isAdmin || !editing || !name.trim()) return
    const done = await run(
      null,
      async () => {
        const { error: saveError } = await supabase
          .from('profiles')
          .update({ name: name.trim(), updated_at: new Date().toISOString() })
          .eq('id', editing.id)
          .select('id')
          .single()
        if (saveError) throw saveError
      },
      'Nome da conta atualizado.'
    )
    if (done) {
      setEditing(null)
      await loadProfiles()
    }
  }

  async function toggle(profile) {
    // ADMIN role/status changes require the last-admin protection in migration 019.
    if (!isAdmin || profile.role !== 'gestor') return
    const next = profile.status === 'active' ? 'suspended' : 'active'
    const done = await run(
      {
        title: `${next === 'active' ? 'Ativar' : 'Desativar'} acesso de ${profile.name || 'esta conta'}?`,
        description:
          next === 'active'
            ? 'A conta voltará a acessar seus acampamentos.'
            : 'O acesso operacional será suspenso. A conta Auth, os acampamentos e o histórico serão preservados.',
        confirmLabel: next === 'active' ? 'Ativar acesso' : 'Desativar acesso',
        destructive: next !== 'active',
      },
      async () => {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ status: next, updated_at: new Date().toISOString() })
          .eq('id', profile.id)
          .eq('role', 'gestor')
          .select('id')
          .single()
        if (updateError) throw updateError
      },
      'Acesso da conta atualizado.'
    )
    if (done) await loadProfiles()
  }

  const columns = [
    {
      key: 'name',
      label: 'Nome',
      render: (profile) => profile.name || 'Nome não informado',
    },
    {
      key: 'email',
      label: 'E-mail',
      render: (profile) => (
        <span className="break-all">{profile.email || 'Não informado'}</span>
      ),
    },
    {
      key: 'role',
      label: 'Papel',
      render: (profile) =>
        profile.role === 'admin'
          ? 'Administrador'
          : profile.role === 'gestor'
            ? 'Gestor'
            : 'Sem perfil',
    },
    {
      key: 'status',
      label: 'Acesso',
      render: (profile) =>
        profile.authMissing
          ? 'Conta Auth ausente'
          : !profile.role
            ? 'Sem acesso'
            : profile.status === 'active'
              ? 'Ativo'
              : 'Desativado',
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (profile) => (
        <RecordActions
          onEdit={
            ['admin', 'gestor'].includes(profile.role) && !profile.authMissing
              ? () => edit(profile)
              : undefined
          }
          disabled={busy}
          onToggle={
            profile.role === 'gestor' && !profile.authMissing
              ? () => toggle(profile)
              : undefined
          }
          toggleLabel={
            profile.status === 'active' ? 'Desativar acesso' : 'Ativar acesso'
          }
        />
      ),
    },
  ]

  if (!isAdmin)
    return <p role="alert">Acesso exclusivo do administrador da plataforma.</p>
  return (
    <section>
      <PageHeader
        eyebrow="Usuários"
        title="Contas existentes"
        description="Gerencie os dados e o acesso das contas cadastradas."
      />
      <p className="mb-6 text-sm text-zinc-400">
        A desativação preserva a conta e seu histórico, mas bloqueia o acesso
        operacional do gestor. Contas ADMIN permitem apenas alteração do nome
        nesta tela. A exclusão definitiva depende de revisão dos vínculos no
        Supabase Auth.
      </p>
      {error && (
        <div role="alert" className="mb-4 text-red-400">
          <p>{error}</p>
          <button
            type="button"
            onClick={loadProfiles}
            className="record-action mt-2"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {editing && (
        <form
          onSubmit={save}
          className="mb-6 space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        >
          <h2 className="text-lg font-bold">Editar conta</h2>
          <label className="block text-sm">
            Nome
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3"
            />
          </label>
          <p className="text-sm text-zinc-400">
            Papel: {editing.role === 'admin' ? 'Administrador' : 'Gestor'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(null)
                setPassword('')
                setConfirmation('')
              }}
              className="record-action"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="record-action bg-yellow-500 text-zinc-950"
            >
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {accountManagementEnabled && editing.role === 'gestor' && (
            <fieldset
              disabled={busy}
              className="space-y-4 border-t border-zinc-800 pt-5"
            >
              <legend className="pt-4 font-semibold">Acesso do gestor</legend>
              <label className="block text-sm">
                E-mail de acesso
                <input
                  name="access_email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                />
              </label>
              <button
                type="button"
                onClick={() => changeAccess('update-email')}
                className="record-action"
              >
                Corrigir e-mail
              </button>
              <label className="block text-sm">
                Nova senha do gestor
                <input
                  name="managed_password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                />
              </label>
              <label className="block text-sm">
                Confirmar nova senha
                <input
                  name="managed_confirmation"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                />
              </label>
              <button
                type="button"
                onClick={() => changeAccess('reset-password')}
                className="record-action"
              >
                Redefinir senha
              </button>
            </fieldset>
          )}
        </form>
      )}
      {loading ? (
        <p>Carregando contas...</p>
      ) : (
        <ResponsiveTable
          columns={columns}
          data={profiles}
          emptyMessage="Nenhuma conta encontrada."
        />
      )}
    </section>
  )
}
