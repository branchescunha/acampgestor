import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActiveCampNotice from '../components/ActiveCampNotice'
import PageHeader from '../components/PageHeader'
import ResponsiveTable from '../components/ResponsiveTable'
import { Plus, Trash2 } from 'lucide-react'
import { createOperationGuard } from '../features/scoringOperations'
import {
  createResultOperation,
  getGymkhanaAwards,
  loadCampResultHistory,
  validateGymkhanaAwards,
} from '../features/eventOperations'
import { useActiveCamp } from '../hooks/useActiveCamp'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'
import EntitySymbol from '../components/EntitySymbol'
import RecordActions from '../components/RecordActions'
import { useReadRetry } from '../hooks/useReadRetry'

const initialForm = {
  title: '',
  awards: [],
  notes: '',
}

const legacySettings = {
  team_a_name: 'Equipe A',
  team_b_name: 'Equipe B',
}

export default function Gymkhana() {
  const [competitionTeams, setCompetitionTeams] = useState([])
  const [legacyTribes, setLegacyTribes] = useState([])
  const [participants, setParticipants] = useState([])
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState(legacySettings)
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const operationGuard = useRef(createOperationGuard())
  const resultOperation = useRef(createResultOperation(supabase))
  const { activeCampId } = useActiveCamp()
  const requestConfirmation = useConfirm()
  const { showError, showSuccess } = useToast()

  const loadData = useCallback(
    async (shouldIgnore = () => false) => {
      setLoading(true)

      if (!activeCampId) {
        if (shouldIgnore()) return
        setCompetitionTeams([])
        setLegacyTribes([])
        setParticipants([])
        setHistory([])
        setSettings(legacySettings)
        setLoading(false)
        return
      }

      const { data: competitionTeamsData, error: competitionTeamsError } =
        await supabase
          .from('competition_teams')
          .select('id, name, color, symbol, leader_name, status, camp_id')
          .eq('camp_id', activeCampId)
          .order('name')

      const { data: legacyTribesData, error: legacyTribesError } =
        await supabase
          .from('tribes')
          .select('id, name, color, symbol, competition_team_id')
          .eq('camp_id', activeCampId)
          .order('name')

      const { data: participantsData, error: participantsError } =
        await supabase
          .from('participants')
          .select(
            `
        id,
        full_name,
        competition_team_id,
        is_active
      `
          )
          .eq('camp_id', activeCampId)
          .eq('is_active', true)
          .order('full_name')

      const { data: historyData, error: historyError } = await loadCampResultHistory(
        supabase, 'gymkhana_events', activeCampId,
        'id, camp_id, title, awards, winning_team, winning_competition_team_id, points_per_member, notes, created_at'
      )

      const { data: settingsRows, error: settingsError } = await supabase
        .from('gymkhana_settings')
        .select('team_a_name, team_b_name')
        .eq('camp_id', activeCampId)
        .limit(1)

      if (
        competitionTeamsError ||
        legacyTribesError ||
        participantsError ||
        historyError ||
        settingsError
      ) {
        logError(
          'Gymkhana',
          competitionTeamsError ||
            legacyTribesError ||
            participantsError ||
            historyError ||
            settingsError
        )
        if (shouldIgnore()) return
        setLoading(false)
        return
      }

      if (shouldIgnore()) return

      const settingsData = settingsRows?.[0]

      setCompetitionTeams(competitionTeamsData || [])
      setLegacyTribes(legacyTribesData || [])
      setParticipants(participantsData || [])
      setHistory(historyData || [])
      setSettings({
        team_a_name: settingsData?.team_a_name || legacySettings.team_a_name,
        team_b_name: settingsData?.team_b_name || legacySettings.team_b_name,
      })
      setLoading(false)
    },
    [activeCampId]
  )

  useReadRetry(loadData)

  useEffect(() => {
    let shouldIgnore = false

    const timeoutId = window.setTimeout(() => {
      setForm(initialForm)
      setEditingId(null)
      void loadData(() => shouldIgnore)
    }, 0)

    return () => {
      shouldIgnore = true
      window.clearTimeout(timeoutId)
    }
  }, [loadData])

  const participantsByTeam = useMemo(() => {
    return participants.reduce((groups, participant) => {
      const teamId = participant.competition_team_id

      if (!teamId) return groups

      const currentParticipants = groups.get(teamId) || []
      groups.set(teamId, [...currentParticipants, participant])

      return groups
    }, new Map())
  }, [participants])

  function getWinningTeamName(winningTeam) {
    if (typeof winningTeam === 'object' && winningTeam !== null) {
      if (winningTeam.winning_competition_team_id) {
        return getWinningTeamName(winningTeam.winning_competition_team_id)
      }

      if (winningTeam.winning_team === 'A')
        return `${settings.team_a_name} (legado)`
      if (winningTeam.winning_team === 'B')
        return `${settings.team_b_name} (legado)`

      const legacyTribe = legacyTribes.find(
        (item) => item.id === winningTeam.winning_team
      )

      return legacyTribe?.name || 'Time legado não encontrado'
    }

    if (winningTeam === 'A') return `${settings.team_a_name} (legado)`
    if (winningTeam === 'B') return `${settings.team_b_name} (legado)`

    const tribe = competitionTeams.find((item) => item.id === winningTeam)
    return tribe?.name || 'Time não encontrado'
  }

  function getWinningTeam(winningTeam) {
    return competitionTeams.find((item) => item.id === winningTeam) || null
  }

  function handleChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  function handleAwardChange(teamId, points) {
    setForm((current) => ({
      ...current,
      awards: current.awards.map((award) =>
        award.competition_team_id === teamId ? { ...award, points } : award
      ),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!activeCampId) {
      showError('Selecione um acampamento antes de lançar gincanas.')
      return
    }

    if (!form.title.trim()) {
      showError('Informe o nome da prova.')
      return
    }

    const awardsError = validateGymkhanaAwards(form.awards, competitionTeams)
    if (awardsError) {
      showError(awardsError)
      return
    }

    if (!operationGuard.current.acquire()) return
    setSaving(true)

    try {
      await resultOperation.current.execute({
        campId: activeCampId,
        kind: 'gymkhana',
        action: 'save',
        recordId: editingId,
        payload: {
          title: form.title.trim(),
          notes: form.notes.trim() || null,
          awards: form.awards.map((award) => ({
            ...award,
            points: Number(award.points),
          })),
        },
      })

      setForm(initialForm)
      setEditingId(null)
      await loadData()
    } catch (error) {
      logError('Gymkhana', error)
      showError(
        'Não foi possível confirmar a operação. Tente novamente sem alterar os dados para repetir a mesma tentativa.'
      )
    } finally {
      operationGuard.current.release()
      setSaving(false)
    }
  }

  function handleEdit(eventItem) {
    if (saving) return
    setEditingId(eventItem.id)

    setForm({
      title: eventItem.title || '',
      awards: getGymkhanaAwards(eventItem).map((award) => ({ ...award })),
      notes: eventItem.notes || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleDelete(eventItem) {
    if (!activeCampId) return
    if (!operationGuard.current.acquire()) return
    setSaving(true)

    try {
      const confirmDelete = await requestConfirmation({
        title: `Cancelar gincana ${eventItem.title || 'selecionada'}?`,
        description:
          'Tem certeza que deseja excluir este lançamento da gincana? As pontuações vinculadas serão anuladas, preservando o histórico.',
        confirmLabel: 'Confirmar cancelamento',
      })
      if (!confirmDelete) return

      await resultOperation.current.execute({
        campId: activeCampId,
        kind: 'gymkhana',
        action: 'delete',
        recordId: eventItem.id,
      })

      if (editingId === eventItem.id) {
        setEditingId(null)
        setForm(initialForm)
      }

      showSuccess('Gincana cancelada. Os pontos foram anulados e o histórico preservado.')
      await loadData()
    } catch (error) {
      logError('Gymkhana', error)
      showError(
        'Não foi possível confirmar a exclusão. Tente novamente para repetir a mesma tentativa.'
      )
    } finally {
      operationGuard.current.release()
      setSaving(false)
    }
  }

  function handleDeleteEditing() {
    const currentEvent = history.find((eventItem) => eventItem.id === editingId)

    if (!currentEvent) {
      showError('Lançamento não encontrado.')
      return
    }

    void handleDelete(currentEvent)
  }

  function renderTeamBadge(eventItem) {
    const team =
      getWinningTeam(eventItem.winning_competition_team_id) ||
      legacyTribes.find((item) => item.id === eventItem.winning_team)

    if (team) {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: team.color }}
          />
          {team.name}
        </span>
      )
    }

    return (
      <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300">
        {getWinningTeamName(eventItem)}
      </span>
    )
  }

  function renderTeamCard(team) {
    const members = participantsByTeam.get(team.id) || []

    return (
      <article
        key={team.id}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl"
                style={{ backgroundColor: team.color }}
              >
                <EntitySymbol value={team.symbol} />
              </div>

              <div>
                <h2 className="text-xl font-bold">{team.name}</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {members.length} participante(s) ativo(s)
                </p>
              </div>
            </div>
          </div>
        </div>

        {team.leader_name && (
          <p className="mt-5 text-sm text-zinc-400">
            Responsável: {team.leader_name}
          </p>
        )}
      </article>
    )
  }

  const columns = [
    {
      key: 'date',
      label: 'Data',
      render: (eventItem) => (
        <span className="text-zinc-400">
          {new Date(eventItem.created_at).toLocaleString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'title',
      label: 'Prova',
      render: (eventItem) => (
        <span className="font-medium">{eventItem.title}</span>
      ),
    },
    {
      key: 'team',
      label: 'Equipes / prêmios',
      render: (eventItem) => {
        const awards = getGymkhanaAwards(eventItem)
        if (!awards.length) return renderTeamBadge(eventItem)
        return (
          <div className="space-y-2">
            {awards.map((award) => (
              <div
                key={award.competition_team_id}
                className="flex flex-wrap items-center gap-2"
              >
                {renderTeamBadge({
                  winning_competition_team_id: award.competition_team_id,
                })}
                <strong
                  className={
                    Number(award.points) < 0 ? 'text-red-400' : 'text-green-400'
                  }
                >
                  {Number(award.points) > 0 ? '+' : ''}
                  {award.points}
                </strong>
              </div>
            ))}
          </div>
        )
      },
    },
    {
      key: 'points',
      label: 'Pontos',
      render: (eventItem) => (
        <strong
          className={
            Number(eventItem.points_per_member) < 0
              ? 'text-red-400'
              : 'text-green-400'
          }
        >
          {getGymkhanaAwards(eventItem).length
            ? '-'
            : `${Number(eventItem.points_per_member) > 0 ? '+' : ''}${eventItem.points_per_member}`}
        </strong>
      ),
    },
    {
      key: 'notes',
      label: 'Observações',
      render: (eventItem) => (
        <span className="text-zinc-400">{eventItem.notes || '-'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (eventItem) => (
        <RecordActions onEdit={() => handleEdit(eventItem)} onDelete={() => handleDelete(eventItem)} deleteLabel="Cancelar" disabled={saving} />
      ),
    },
  ]

  const availableTeams = competitionTeams.filter(
    (team) => team.status === 'active'
  )
  const hasEnoughTeams = competitionTeams.length > 0

  return (
    <section>
      <PageHeader
        eyebrow="Gincana"
        title="Gincana dinâmica"
        description="Lance resultados usando os times cadastrados neste acampamento."
      />

      {!activeCampId && (
        <div className="mb-6">
          <ActiveCampNotice message="Selecione um acampamento para lançar resultados da gincana." />
        </div>
      )}

      {activeCampId && competitionTeams.length === 0 && (
        <p className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          Cadastre times antes de lançar resultados da gincana.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {availableTeams.map(renderTeamCard)}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6"
      >
        <h2 className="text-xl font-bold">
          {editingId
            ? 'Editar resultado da gincana'
            : 'Lançar resultado da gincana'}
        </h2>

        <fieldset disabled={saving}>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Nome da prova"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500 xl:col-span-2"
            />
          </div>

          <fieldset disabled={saving} className="mt-4 space-y-3">
            <legend className="text-sm font-semibold text-zinc-300">
              Prêmios por equipe
            </legend>
            {form.awards.map((award) => (
              <div
                key={award.competition_team_id}
                className="flex flex-wrap items-center gap-3"
              >
                <label className="min-w-0 flex-1 text-sm">
                  {getWinningTeamName(award.competition_team_id)}
                  <input
                    type="number"
                    step="1"
                    value={award.points}
                    onChange={(event) =>
                      handleAwardChange(
                        award.competition_team_id,
                        event.target.value
                      )
                    }
                    aria-label={`Pontos de ${getWinningTeamName(award.competition_team_id)}`}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
                  />
                </label>
                <button
                  type="button"
                  title="Remover prêmio"
                  aria-label={`Remover prêmio de ${getWinningTeamName(award.competition_team_id)}`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      awards: current.awards.filter(
                        (item) =>
                          item.competition_team_id !== award.competition_team_id
                      ),
                    }))
                  }
                  className="rounded-lg border border-zinc-700 p-3 text-red-400"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Plus size={18} aria-hidden="true" />
              <select
                value=""
                aria-label="Adicionar equipe premiada"
                onChange={(event) => {
                  const teamId = event.target.value
                  if (!teamId) return
                  setForm((current) =>
                    current.awards.some(
                      (award) => award.competition_team_id === teamId
                    )
                      ? current
                      : {
                          ...current,
                          awards: [
                            ...current.awards,
                            { competition_team_id: teamId, points: '' },
                          ],
                        }
                  )
                }}
                className="min-w-0 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
              >
                <option value="">Adicionar equipe premiada</option>
                {availableTeams
                  .filter(
                    (team) =>
                      !form.awards.some(
                        (award) => award.competition_team_id === team.id
                      )
                  )
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </div>
          </fieldset>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Observações"
            className="mt-4 min-h-24 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />

          <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
            {editingId && (
              <>
                <button
                  type="button"
                  onClick={handleDeleteEditing}
                  disabled={saving || !activeCampId}
                  className="rounded-xl border border-red-500/40 px-6 py-3 font-semibold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Excluir
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="rounded-xl border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar edição
                </button>
              </>
            )}

            <button
              type="submit"
              disabled={saving || !activeCampId || !hasEnoughTeams}
              className="rounded-xl bg-yellow-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? 'Salvando...'
                : editingId
                  ? 'Salvar alterações'
                  : 'Lançar pontos da gincana'}
            </button>
          </div>
        </fieldset>
      </form>

      <div className="mt-8">
        {loading ? (
          <p className="text-zinc-400">Carregando gincana...</p>
        ) : (
          <ResponsiveTable
            columns={columns}
            data={history}
            emptyMessage="Nenhum resultado de gincana lançado."
          />
        )}
      </div>
    </section>
  )
}
