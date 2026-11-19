import { useEffect, useMemo, useState } from 'react'
import ActiveCampNotice from '../components/ActiveCampNotice'
import PageHeader from '../components/PageHeader'
import { useActiveCamp } from '../hooks/useActiveCamp'
import { useRecordAction } from '../hooks/useRecordAction'
import SymbolField from '../components/SymbolField'
import EntitySymbol from '../components/EntitySymbol'
import RecordActions from '../components/RecordActions'
import { validateSymbol } from '../utils/symbols'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

const colorOptions = [
  { name: 'Dourado', value: '#eab308' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Vermelho', value: '#ef4444' },
  { name: 'Roxo', value: '#8b5cf6' },
  { name: 'Laranja', value: '#f97316' },
  { name: 'Ciano', value: '#06b6d4' },
  { name: 'Lima', value: '#84cc16' },
]

const initialForm = {
  name: '',
  color: '#eab308',
  symbol: '',
  leader_name: '',
  status: 'active',
}

function getCompetitionTeamErrorMessage(error, fallback) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()

  if (
    error?.code === '23505' ||
    message.includes('competition_teams_camp_name_unique_idx')
  ) {
    return 'Já existe uma equipe com esse nome neste acampamento.'
  }

  if (
    error?.code === '23503' ||
    error?.code === '23514' ||
    message.includes('foreign key')
  ) {
    return 'A equipe selecionada não pertence a este acampamento.'
  }

  return fallback
}

export default function CompetitionTeams() {
  const [teams, setTeams] = useState([])
  const [participants, setParticipants] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { activeCampId } = useActiveCamp()
  const { run: runAction, busy: actionBusy } = useRecordAction()
  const { showError } = useToast()

  useEffect(() => {
    let shouldIgnore = false

    async function loadTeams() {
      setLoading(true)

      const { data, error } = await supabase
        .from('competition_teams')
        .select(
          'id, camp_id, name, color, symbol, leader_name, status, created_at, updated_at',
        )
        .eq('camp_id', activeCampId)
        .order('status', { ascending: true })
        .order('name', { ascending: true })

      const { data: members, error: membersError } = await supabase
        .from('participants')
        .select('id, full_name, competition_team_id, is_active')
        .eq('camp_id', activeCampId)
        .order('full_name')

      if (error || membersError) {
        logError('CompetitionTeams', error || membersError)
        if (shouldIgnore) return
        setTeams([])
        setParticipants([])
        showError('Erro ao carregar equipes e participantes.')
        setLoading(false)
        return
      }

      if (shouldIgnore) return

      setTeams(data || [])
      setParticipants(members || [])
      setLoading(false)
    }

    if (activeCampId) {
      loadTeams()
      const retry = () => { void loadTeams() }
      window.addEventListener('acampgestor:retry-reads', retry)
      return () => {
        shouldIgnore = true
        window.removeEventListener('acampgestor:retry-reads', retry)
      }
    }

    const timeoutId = window.setTimeout(() => {
      setTeams([])
      setParticipants([])
      setLoading(false)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCampId, showError])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setForm(initialForm)
      setEditingId(null)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCampId])

  async function reloadTeams() {
    const { data, error } = await supabase
      .from('competition_teams')
      .select(
        'id, camp_id, name, color, symbol, leader_name, status, created_at, updated_at',
      )
      .eq('camp_id', activeCampId)
      .order('status', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      logError('CompetitionTeams', error)
      return
    }

    setTeams(data || [])
  }

  function handleChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  function handleEdit(team) {
    setEditingId(team.id)

    setForm({
      name: team.name || '',
      color: team.color || '#eab308',
      symbol: team.symbol || '',
      leader_name: team.leader_name || '',
      status: team.status || 'active',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleDelete(team = teams.find(item => item.id === editingId)) {
    if (!team || saving) return
    const done = await runAction({ title: `Excluir equipe ${team.name}?`, description: 'Equipes com quartos, participantes ou histórico não podem ser excluídas. Nesses casos, use Inativar.', confirmLabel: 'Confirmar exclusão' }, async () => {
      const { error } = await supabase.from('competition_teams').delete().eq('id', team.id).eq('camp_id', activeCampId).select('id').single()
      if (error) throw error
    }, 'Equipe excluída.')
    if (done) { if (editingId === team.id) handleCancelEdit(); await reloadTeams() }
  }

  async function handleStatusToggle(team) {
    if (saving) return
    const nextStatus = team.status === 'active' ? 'inactive' : 'active'
    const done = await runAction({ title: `${nextStatus === 'active' ? 'Ativar' : 'Inativar'} equipe ${team.name}?`, description: 'Inativa, a equipe não aparece no ranking público. Seus pontos e vínculos são preservados e voltam ao ranking após a reativação.', confirmLabel: nextStatus === 'active' ? 'Ativar' : 'Inativar', destructive: nextStatus !== 'active' }, async () => {
    const { error } = await supabase
      .from('competition_teams')
      .update({ status: nextStatus })
      .eq('id', team.id)
      .eq('camp_id', activeCampId)
      .select('id').single()
    if (error) throw error
    }, 'Status da equipe atualizado.')
    if (!done) return

    if (editingId === team.id) {
      setForm((currentForm) => ({
        ...currentForm,
        status: nextStatus,
      }))
    }

    await reloadTeams()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving || actionBusy) return
    const symbolError = validateSymbol(form.symbol, teams.find(item => item.id === editingId)?.symbol || '')
    if (symbolError) { showError(symbolError); return }

    if (!activeCampId) {
      showError('Selecione um acampamento antes de cadastrar equipes.')
      return
    }

    const teamName = form.name.trim()

    if (!teamName) {
      showError('Informe o nome da equipe.')
      return
    }

    setSaving(true)

    const payload = {
      name: teamName,
      color: form.color || null,
      symbol: editingId && form.symbol === teams.find(item => item.id === editingId)?.symbol ? form.symbol : form.symbol.trim() || null,
      leader_name: form.leader_name.trim() || null,
      status: form.status,
    }

    const request = editingId
      ? supabase
          .from('competition_teams')
          .update(payload)
          .eq('id', editingId)
          .eq('camp_id', activeCampId)
      : supabase.from('competition_teams').insert({
          ...payload,
          camp_id: activeCampId,
        })

    const { error } = await request

    if (error) {
      logError('CompetitionTeams', error)
      showError(getCompetitionTeamErrorMessage(error, 'Erro ao salvar equipe.'))
      setSaving(false)
      return
    }

    setForm(initialForm)
    setEditingId(null)
    await reloadTeams()
    setSaving(false)
  }

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1
      }

      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [teams])

  const activeCount = teams.filter((team) => team.status === 'active').length
  const selectedColor = colorOptions.find((color) => color.value === form.color)

  return (
    <section>
      <PageHeader
        eyebrow="Competição"
        title="Equipes"
        description="Gerencie as equipes competitivas usadas em pontuações e gincanas do acampamento."
      />

      {!activeCampId && (
        <div className="mb-6">
          <ActiveCampNotice message="Selecione um acampamento para cadastrar e gerenciar equipes." />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6"
      >
        <h2 className="text-xl font-bold">
          {editingId ? 'Editar equipe' : 'Nova equipe'}
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Nome da equipe"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />

          <select
            name="color"
            value={form.color}
            onChange={handleChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            {colorOptions.map((color) => (
              <option key={color.value} value={color.value}>
                {color.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
            <div
              className="h-6 w-6 rounded-lg"
              style={{ backgroundColor: form.color }}
            />
            <span className="text-sm text-zinc-300">
              {selectedColor?.name || 'Cor selecionada'}
            </span>
          </div>

          <SymbolField value={form.symbol} original={teams.find(item => item.id === editingId)?.symbol} onChange={handleChange} />

          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>

          <input
            name="leader_name"
            value={form.leader_name}
            onChange={handleChange}
            placeholder="Líder / responsável"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500 md:col-span-2 xl:col-span-5"
          />
        </div>

        <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
          {editingId && (
            <>
              <button
                type="button"
                onClick={() => handleDelete()}
                className="rounded-xl border border-red-500/40 px-6 py-3 font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                Excluir
              </button>

              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-xl border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 transition hover:bg-zinc-800"
              >
                Cancelar
              </button>
            </>
          )}

          <button
            type="submit"
            disabled={saving || !activeCampId}
            className="rounded-xl bg-yellow-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Salvando...'
              : editingId
                ? 'Salvar alterações'
                : 'Criar equipe'}
          </button>
        </div>
      </form>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-bold">Lista de equipes</h2>

            <p className="mt-2 text-sm text-zinc-400">
              {teams.length} equipe(s) cadastrada(s). {activeCount} ativa(s).
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <p className="text-zinc-400">Carregando equipes...</p>
        ) : sortedTeams.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <h2 className="text-xl font-bold">
              Nenhuma equipe cadastrada neste acampamento.
            </h2>
            <p className="mt-3 text-sm text-zinc-400">
              Crie equipes competitivas para organizar a pontuação e a gincana.
            </p>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-5 rounded-xl bg-yellow-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-yellow-400"
            >
              Criar equipe
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedTeams.map((team) => (
              <article
                key={team.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                    style={{ backgroundColor: team.color || '#27272a' }}
                  >
                    <EntitySymbol value={team.symbol} fallback={team.name?.slice(0, 1)} />
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      team.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    {team.status === 'active' ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <h2 className="mt-6 text-2xl font-bold">{team.name}</h2>

                <div className="mt-5 space-y-2 text-sm text-zinc-400">
                  <p>Responsável: {team.leader_name || 'Não definido'}</p>
                </div>

                <details className="mt-4 text-sm text-zinc-300">
                  <summary className="cursor-pointer">Ver participantes</summary>
                  {!participants.some((participant) => participant.competition_team_id === team.id) && (
                    <p className="mt-2">Nenhum participante vinculado.</p>
                  )}
                  <ul className="mt-2 space-y-1">
                    {participants.filter((participant) => participant.competition_team_id === team.id).map((participant) => (
                      <li key={participant.id}>
                        {participant.full_name}{!participant.is_active && ' (inativo)'}
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="mt-6"><RecordActions onEdit={() => handleEdit(team)} onDelete={() => handleDelete(team)} onToggle={() => handleStatusToggle(team)} toggleLabel={team.status === 'active' ? 'Inativar' : 'Ativar'} disabled={saving || actionBusy} /></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
