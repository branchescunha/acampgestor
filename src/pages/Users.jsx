import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import ResponsiveTable from '../components/ResponsiveTable'
import RecordActions from '../components/RecordActions'
import { useUserProfile } from '../hooks/useUserProfile'
import { useRecordAction } from '../hooks/useRecordAction'
import { supabase } from '../lib/supabase'
import { connectionMessage } from '../utils/network'
import { useReadRetry } from '../hooks/useReadRetry'

export default function Users() {
  const { isAdmin } = useUserProfile()
  const [profiles, setProfiles] = useState([])
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { run, busy } = useRecordAction()

  const loadProfiles = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('id, name, email, role, status')
      .order('name')
    setError(loadError ? connectionMessage(loadError) : '')
    if (!loadError) setProfiles(data || [])
    setLoading(false)
  }, [isAdmin])

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        profile.role === 'admin' ? 'Administrador' : 'Gestor',
    },
    {
      key: 'status',
      label: 'Acesso',
      render: (profile) =>
        profile.status === 'active' ? 'Ativo' : 'Desativado',
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (profile) => (
        <RecordActions
          onEdit={() => edit(profile)}
          disabled={busy}
          onToggle={
            profile.role === 'gestor' ? () => toggle(profile) : undefined
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
        description="Gerencie os nomes e o acesso das contas cadastradas."
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
              onClick={() => setEditing(null)}
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
