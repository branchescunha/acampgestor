import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { CheckCircle2, CircleDashed, LogOut, Plus, TentTree } from 'lucide-react'
import CreateCampForm from '../components/CreateCampForm'
import { useActiveCamp } from '../hooks/useActiveCamp'
import { useAuthContext } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

const campStatusLabels = {
  active: 'Ativo',
  draft: 'Rascunho',
  archived: 'Arquivado',
}

function getCampStatusLabel(status) {
  return campStatusLabels[status] || 'Status não informado'
}

function getCampStatusIcon(status) {
  return status === 'active' ? CheckCircle2 : CircleDashed
}
export default function Gestor() {
  const location = useLocation()
  const { session, loadingAuth } = useAuthContext()
  const {
    profile,
    isAdmin,
    isGestor,
    isActive,
    loading: loadingProfile,
    error: profileError,
  } = useUserProfile()
  const { setActiveCamp } = useActiveCamp()
  const [camps, setCamps] = useState([])
  const [loadingCamps, setLoadingCamps] = useState(true)
  const [error, setError] = useState('')
  const [creatingCamp, setCreatingCamp] = useState(false)
  const [editingCamp, setEditingCamp] = useState(null)
  const [success, setSuccess] = useState('')

  const loadCamps = useCallback(async () => {
    setLoadingCamps(true)
    setError('')

    const { data, error: campsError } = await supabase
      .from('camps')
      .select('id, name, slug, church_name, theme, status, start_date, end_date, inspection_schedule')
      .order('name', { ascending: true })

    if (campsError) {
      logError('Gestor', campsError)
      setError('Não foi possível carregar seus acampamentos.')
      setLoadingCamps(false)
      return
    }

    setCamps(data || [])
    setLoadingCamps(false)
  }, [])

  useEffect(() => {
    if (session && isGestor) {
      const timeoutId = window.setTimeout(() => {
        void loadCamps()
      }, 0)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [isGestor, loadCamps, session])

  if (loadingAuth || loadingProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">Verificando acesso gestor...</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />
  }

  if (!profile || !isActive || !isGestor) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-yellow-500">
            AcampGestor
          </p>
          <h1 className="mt-4 text-3xl font-bold">Acesso gestor indisponível</h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            {profileError ||
              'Sua conta não possui permissão ativa para acessar a área do gestor.'}
          </p>
          {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <LogOut size={18} />
            Sair da conta
          </button>
        </section>
      </main>
    )
  }

  if (loadingCamps) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">Carregando acampamentos...</p>
      </main>
    )
  }

  async function handleLogout() {
    setError('')
    const { error: logoutError } = await supabase.auth.signOut()

    if (logoutError) {
      logError('Gestor', logoutError)
      setError('Não foi possível sair da conta. Tente novamente.')
      return
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-yellow-500">
              AcampGestor
            </p>
            <h1 className="mt-3 text-3xl font-bold">Meus Acampamentos</h1>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Selecione um acampamento para acessar o painel de gestão.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setCreatingCamp(true)
                setEditingCamp(null)
                setSuccess('')
              }}
              disabled={creatingCamp}
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-yellow-400 disabled:opacity-60"
            >
              <Plus size={18} />
              Novo acampamento
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </div>

        {success && (
          <p role="status" className="mt-6 text-sm text-emerald-300">
            {success}
          </p>
        )}

        {(creatingCamp || editingCamp) && (
          <CreateCampForm
            key={editingCamp?.id || 'new'}
            camp={editingCamp}
            userId={session.user.id}
            onCancel={() => { setCreatingCamp(false); setEditingCamp(null) }}
            onCreated={async () => {
              setCreatingCamp(false)
              setEditingCamp(null)
              await loadCamps()
              setSuccess(editingCamp ? 'Acampamento atualizado.' : 'Acampamento criado. Selecione-o para começar a gestão.')
            }}
          />
        )}

        {error && (
          <p
            role="alert"
            className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        {!error && camps.length === 0 && (
          <p className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
            Nenhum acampamento disponível para sua conta.
          </p>
        )}

        {camps.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {camps.map((camp) => {
              const content = (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <strong className="block text-lg">{camp.name}</strong>
                      <span className="mt-2 block text-sm text-zinc-400">
                        {camp.church_name || 'Organização não informada'}
                      </span>
                    </div>
                    <TentTree size={22} className="text-yellow-400" />
                  </div>

                  <span className="mt-4 block text-sm text-zinc-400">
                    {camp.theme || 'Sem tema informado'}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
                    {(() => {
                      const StatusIcon = getCampStatusIcon(camp.status)

                      return <StatusIcon size={14} />
                    })()}
                    {getCampStatusLabel(camp.status)}
                  </span>
                </>
              )

              if (!camp.slug) {
                return (
                  <div
                    key={camp.id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 opacity-70"
                  >
                    {content}
                    <p className="mt-5 text-sm text-zinc-500">
                      Este acampamento ainda não possui URL de acesso.
                    </p>
                    <button type="button" className="mt-5 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={() => { setEditingCamp(camp); setCreatingCamp(false); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editar acampamento</button>
                  </div>
                )
              }

              return (
                <article key={camp.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                <Link
                  key={camp.id}
                  to={`/${camp.slug}/gestor`}
                  onClick={() => setActiveCamp(camp)}
                  className="block transition hover:text-yellow-400"
                >
                  {content}
                </Link>
                <button type="button" className="mt-5 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800" onClick={() => { setEditingCamp(camp); setCreatingCamp(false); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editar acampamento</button>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
