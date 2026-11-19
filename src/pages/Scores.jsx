import { useEffect, useMemo, useRef, useState } from 'react'
import ActiveCampNotice from '../components/ActiveCampNotice'
import PageHeader from '../components/PageHeader'
import ResponsiveTable from '../components/ResponsiveTable'
import {
  getScoreCategories,
  getScoreTypeLabel,
} from '../domain/scoring'
import { calculateRanking } from '../domain/ranking'
import { loadCampScoreTotals, readAllPages, totalsAsScoreEntries } from '../features/scores/scoreTotals'
import { createResultOperation } from '../features/eventOperations'
import {
  buildScorePayload,
  filterScoreEvents,
  initialScoreFilters,
  initialScoreForm,
  isLegacyScoreEditing,
  validateScoreForm,
} from '../features/scores/scoreForm'
import { useActiveCamp } from '../hooks/useActiveCamp'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'
import EntitySymbol from '../components/EntitySymbol'
import RecordActions from '../components/RecordActions'
import { useActorNames } from '../hooks/useActorNames'

export default function Scores() {
  const [tribes, setTribes] = useState([])
  const [competitionTeams, setCompetitionTeams] = useState([])
  const [participants, setParticipants] = useState([])
  const [events, setEvents] = useState([])
  const [scoreTotals, setScoreTotals] = useState(null)
  const [form, setForm] = useState(initialScoreForm)
  const [filters, setFilters] = useState(initialScoreFilters)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const scoreOperation = useRef(createResultOperation(supabase))
  const { activeCampId } = useActiveCamp()
  const requestConfirmation = useConfirm()
  const { showError, showSuccess } = useToast()
  const responsibleName = useActorNames(events, activeCampId)

  useEffect(() => {
    let shouldIgnore = false

    async function loadData() {
      setLoading(true)

      const { data: tribesData, error: tribesError } = await supabase
        .from('tribes')
        .select('id, camp_id, name, color, symbol, competition_team_id')
        .eq('camp_id', activeCampId)
        .order('name')

      const { data: competitionTeamsData, error: competitionTeamsError } =
        await supabase
          .from('competition_teams')
          .select('id, camp_id, name, color, symbol, status')
          .eq('camp_id', activeCampId)
          .order('status', { ascending: true })
          .order('name', { ascending: true })

      const { data: participantsData, error: participantsError } =
        await supabase
          .from('participants')
          .select('id, camp_id, full_name, tribe_id, competition_team_id, is_active')
          .eq('camp_id', activeCampId)
          .eq('is_active', true)
          .order('full_name')

      const { data: eventsData, error: eventsError } = await readAllPages(() => supabase
        .from('score_events')
        .select(
          `
          id,
          camp_id,
          tribe_id,
          competition_team_id,
          participant_id,
          type,
          category,
          points,
          reason,
          notes,
          gymkhana_event_id,
          room_inspection_id,
          created_at,
          created_by,
          is_voided,
          tribes (
            name,
            color,
            symbol
          ),
          competition_teams (
            name,
            color,
            symbol,
            status
          ),
          participants (
            full_name
          )
        `
        )
        .eq('camp_id', activeCampId)
        .order('created_at', { ascending: false })
        .order('id')
      )

      const { data: totalsData, error: totalsError } = await loadCampScoreTotals(
        supabase, 'camp_score_totals', activeCampId,
      )

      if (
        tribesError ||
        competitionTeamsError ||
        participantsError ||
        eventsError || totalsError
      ) {
        logError('Scores',
          tribesError ||
            competitionTeamsError ||
            participantsError ||
            eventsError || totalsError
        )
        if (shouldIgnore) return
        setTribes([])
        setCompetitionTeams([])
        setParticipants([])
        setEvents([])
        setScoreTotals(null)
        showError('Erro ao carregar pontuações.')
        setLoading(false)
        return
      }

      if (shouldIgnore) return

      setTribes(tribesData || [])
      setCompetitionTeams(competitionTeamsData || [])
      setParticipants(participantsData || [])
      setEvents(eventsData || [])
      setScoreTotals(totalsData || [])
      setLoading(false)
    }

    if (activeCampId) {
      loadData()
      const retry = () => { void loadData() }
      window.addEventListener('acampgestor:retry-reads', retry)
      return () => {
        shouldIgnore = true
        window.removeEventListener('acampgestor:retry-reads', retry)
      }
    }

    const timeoutId = window.setTimeout(() => {
      setTribes([])
      setCompetitionTeams([])
      setParticipants([])
      setEvents([])
      setScoreTotals(null)
      setLoading(false)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCampId, showError])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setForm(initialScoreForm)
      setFilters(initialScoreFilters)
      setEditingId(null)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCampId])

  async function reloadEvents() {
    const { data, error } = await readAllPages(() => supabase
      .from('score_events')
      .select(
        `
        id,
        camp_id,
        tribe_id,
        competition_team_id,
        participant_id,
        type,
        category,
        points,
        reason,
        notes,
        gymkhana_event_id,
        room_inspection_id,
        created_at,
        created_by,
        is_voided,
        tribes (
          name,
          color,
          symbol
        ),
        competition_teams (
          name,
          color,
          symbol,
          status
        ),
        participants (
          full_name
        )
      `
      )
      .eq('camp_id', activeCampId)
      .order('created_at', { ascending: false })
      .order('id')
    )

    if (error) {
      logError('Scores', error)
      showError('Não foi possível atualizar a lista de lançamentos.')
      return
    }

    const { data: totalsData, error: totalsError } = await loadCampScoreTotals(
      supabase, 'camp_score_totals', activeCampId,
    )
    if (totalsError) {
      logError('Scores', totalsError)
      setScoreTotals(null)
      showError('Não foi possível atualizar os saldos.')
    } else {
      setScoreTotals(totalsData || [])
    }
    setEvents(data || [])
  }

  function handleChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  function handleParticipantChange(event) {
    const participantId = event.target.value
    const selectedParticipant = participants.find(
      (participant) => participant.id === participantId
    )

    setForm((currentForm) => ({
      ...currentForm,
      participant_id: participantId,
      competition_team_id:
        selectedParticipant?.competition_team_id ||
        currentForm.competition_team_id,
    }))
  }

  function handleCompetitionTeamChange(event) {
    setForm((currentForm) => ({
      ...currentForm,
      competition_team_id: event.target.value,
      participant_id: '',
    }))
  }

  function handleLegacyTribeChange(event) {
    setForm((currentForm) => ({
      ...currentForm,
      tribe_id: event.target.value,
      participant_id: '',
    }))
  }

  function handleFilterChange(event) {
    const { name, value } = event.target

    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }))
  }

  function clearFilters() {
    setFilters(initialScoreFilters)
  }

  function handleEdit(eventItem) {
    setEditingId(eventItem.id)

    setForm({
      tribe_id: '',
      competition_team_id: eventItem.competition_team_id || tribes.find((room) => room.id === eventItem.tribe_id)?.competition_team_id || '',
      participant_id: eventItem.participant_id || '',
      type: eventItem.type,
      category: eventItem.category || '',
      points: Math.abs(eventItem.points).toString(),
      reason: eventItem.reason || '',
      notes: eventItem.notes || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(initialScoreForm)
  }

  async function handleDelete(eventItem = events.find(item => item.id === editingId)) {
    if (!eventItem || eventItem.is_voided || eventItem.gymkhana_event_id || eventItem.room_inspection_id) return
    if (savingRef.current) return
    savingRef.current = true
    try {
      const confirmed = await requestConfirmation({
        title: `Anular lançamento: ${eventItem.reason || eventItem.category || 'Pontuação'}?`,
        description: 'O lançamento ficará no histórico, sem contribuir para o saldo.',
        confirmLabel: 'Anular',
      })
      if (!confirmed) return
      setSaving(true)
      await scoreOperation.current.execute({ campId: activeCampId, kind: 'score', action: 'delete', recordId: eventItem.id })
      if (editingId === eventItem.id) { setEditingId(null); setForm(initialScoreForm) }
      showSuccess('Lançamento anulado. O histórico foi preservado.')
      await reloadEvents()
    } catch (error) {
      logError('Scores', error)
      showError('Não foi possível anular o lançamento. Tente novamente.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (savingRef.current) return

    if (!activeCampId) {
      showError('Selecione um acampamento antes de lançar pontuações.')
      return
    }

    const isLegacyEditing = isLegacyScoreEditing(editingId, form)

    const validationError = validateScoreForm(
      form,
      activeCampId,
      isLegacyEditing,
    )

    if (validationError) {
      showError(validationError)
      return
    }

    savingRef.current = true
    setSaving(true)

    try {
      const payload = buildScorePayload(form, activeCampId, isLegacyEditing)

      await scoreOperation.current.execute({ campId: activeCampId, kind: 'score', action: 'save', recordId: editingId, payload })

      setForm(initialScoreForm)
      setEditingId(null)
      await reloadEvents()
    } catch (error) {
      logError('Scores', error)
      showError('Erro ao salvar lançamento.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const activeCompetitionTeams = useMemo(() => {
    return competitionTeams.filter((team) => team.status === 'active')
  }, [competitionTeams])

  const standings = useMemo(() => calculateRanking(
    competitionTeams, totalsAsScoreEntries(scoreTotals || []), participants,
    { includeInactive: true, scoreTeamIdField: 'competition_team_id', participantTeamIdField: 'competition_team_id' },
  ), [competitionTeams, scoreTotals, participants])

  const formCompetitionTeams = useMemo(() => {
    if (!form.competition_team_id) return activeCompetitionTeams

    const selectedTeam = competitionTeams.find(
      (team) => team.id === form.competition_team_id
    )

    if (!selectedTeam || selectedTeam.status === 'active') {
      return activeCompetitionTeams
    }

    return [...activeCompetitionTeams, selectedTeam].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    )
  }, [activeCompetitionTeams, competitionTeams, form.competition_team_id])

  const isLegacyEditing = isLegacyScoreEditing(editingId, form)

  const formParticipants = isLegacyEditing
    ? form.tribe_id
      ? participants.filter(
          (participant) => participant.tribe_id === form.tribe_id
        )
      : participants
    : form.competition_team_id
      ? participants.filter(
          (participant) =>
            participant.competition_team_id === form.competition_team_id
        )
      : participants

  const filterParticipants = filters.tribe_id
    ? participants.filter(
        (participant) => participant.tribe_id === filters.tribe_id
      )
    : participants

  const formCategories = getScoreCategories(form.type)

  const filterCategories = useMemo(() => {
    return getScoreCategories(filters.type)
  }, [filters.type])

  const filteredEvents = useMemo(() => {
    return filterScoreEvents(events, filters)
  }, [events, filters])

  const columns = [
    {
      key: 'target',
      label: 'Destino',
      render: (eventItem) =>
        eventItem.competition_teams ? (
          <div className="flex items-center justify-end gap-3 md:justify-start">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
              style={{ backgroundColor: eventItem.competition_teams.color }}
            >
              <EntitySymbol value={eventItem.competition_teams.symbol} />
            </div>
            <span>Equipe: {eventItem.competition_teams.name}</span>
          </div>
        ) : eventItem.tribes ? (
          <div className="flex items-center justify-end gap-3 md:justify-start">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
              style={{ backgroundColor: eventItem.tribes.color }}
            >
              <EntitySymbol value={eventItem.tribes.symbol} />
            </div>
            <span>Quarto: {eventItem.tribes.name}</span>
          </div>
        ) : (
          <span className="text-zinc-500">Sem destino</span>
        ),
    },
    {
      key: 'participant',
      label: 'Participante',
      render: (eventItem) => (
        <span className="text-zinc-400">
          {eventItem.participants?.full_name ||
            (eventItem.competition_team_id
              ? 'Equipe inteira'
              : 'Quarto inteiro')}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (eventItem) => (
        <span>{getScoreTypeLabel(eventItem.type)}</span>
      ),
    },
    {
      key: 'category',
      label: 'Categoria',
      render: (eventItem) => (
        <span className="text-zinc-400">{eventItem.category}</span>
      ),
    },
    {
      key: 'points',
      label: 'Pontos',
      render: (eventItem) => (
        <strong
          className={eventItem.points >= 0 ? 'text-green-400' : 'text-red-400'}
        >
          {eventItem.points > 0 ? `+${eventItem.points}` : eventItem.points}
        </strong>
      ),
    },
    {
      key: 'reason',
      label: 'Motivo',
      render: (eventItem) => (
        <span className="text-zinc-400">{eventItem.reason || '-'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (eventItem) => eventItem.is_voided ? 'Anulado' : eventItem.gymkhana_event_id || eventItem.room_inspection_id ? 'Gerenciar na origem' : (
        <RecordActions onEdit={() => handleEdit(eventItem)} onDelete={() => handleDelete(eventItem)} deleteLabel="Anular" disabled={saving} />
      ),
    },
    {
      key: 'created_by',
      label: 'Conta responsável',
      render: (eventItem) => <span className="text-xs text-zinc-400">{responsibleName(eventItem.created_by)}</span>,
    },
  ]

  return (
    <section>
      <PageHeader
        eyebrow="Pontuação"
        title="Lançar Pontos"
        description="Registro manual de pontos e penalidades das equipes."
      />

      {!activeCampId && (
        <div className="mb-6">
          <ActiveCampNotice message="Selecione um acampamento para lançar e consultar pontuações." />
        </div>
      )}

      {activeCampId && !loading && scoreTotals !== null && standings.length > 0 && (
        <section className="mb-6 border-b border-zinc-800 pb-4">
          <h2 className="text-lg font-bold">Saldo das equipes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {standings.map((team) => (
              <li key={team.id} className="flex justify-between gap-4">
                <span>{team.name}{team.status === 'inactive' && ' (inativo)'}</span>
                <span>{team.total} pontos</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6"
      >
        <h2 className="text-xl font-bold">
          {editingId ? 'Editar lançamento' : 'Novo lançamento'}
        </h2>

        {!editingId && activeCompetitionTeams.length === 0 && (
          <p className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            Cadastre pelo menos uma equipe ativa antes de lançar pontuações
            competitivas.
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLegacyEditing ? (
            <select
              name="tribe_id"
              value={form.tribe_id}
              onChange={handleLegacyTribeChange}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            >
              <option value="">Selecione o quarto</option>
              {tribes.map((tribe) => (
                <option key={tribe.id} value={tribe.id}>
                  {tribe.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              name="competition_team_id"
              value={form.competition_team_id}
              onChange={handleCompetitionTeamChange}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            >
              <option value="">Selecione a equipe</option>
              {formCompetitionTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                  {team.status === 'inactive' ? ' (inativo)' : ''}
                </option>
              ))}
            </select>
          )}

          <select
            name="participant_id"
            value={form.participant_id}
            onChange={handleParticipantChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">
              {isLegacyEditing
                ? 'Quarto inteiro / participante'
                : 'Equipe inteira / participante'}
            </option>
            {formParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.full_name}
              </option>
            ))}
          </select>

          <select
            name="type"
            value={form.type}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                type: event.target.value,
                category: '',
              }))
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="POINT">{getScoreTypeLabel('POINT')}</option>
            <option value="PENALTY">{getScoreTypeLabel('PENALTY')}</option>
          </select>

          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Categoria</option>
            {formCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <input
            name="points"
            value={form.points}
            onChange={handleChange}
            type="number"
            min="1"
            placeholder="Pontos"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />

          <input
            name="reason"
            value={form.reason}
            onChange={handleChange}
            placeholder="Motivo"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500 md:col-span-2 xl:col-span-3"
          />
        </div>

        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          placeholder="Observações"
          className="mt-4 min-h-24 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
        />

        <div className="mt-4 flex flex-col justify-end gap-3 sm:flex-row">
          {editingId && (
            <>
              <button
                type="button"
                onClick={() => handleDelete()}
                className="rounded-xl border border-red-500/40 px-6 py-3 font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                Anular
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
            disabled={
              saving ||
              !activeCampId ||
              (!editingId && activeCompetitionTeams.length === 0)
            }
            className="rounded-xl bg-yellow-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Salvando...'
              : editingId
                ? 'Salvar alterações'
                : 'Lançar pontuação'}
          </button>
        </div>
      </form>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-bold">Filtros</h2>
            <p className="mt-2 text-sm text-zinc-400">
              {filteredEvents.length} de {events.length} lançamento(s)
              exibido(s).
            </p>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            Limpar filtros
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <input
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Buscar por motivo, equipe, quarto ou participante"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500 xl:col-span-2"
          />

          <select
            name="competition_team_id"
            value={filters.competition_team_id}
            onChange={handleFilterChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todas as equipes</option>
            {activeCompetitionTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          <select
            name="tribe_id"
            value={filters.tribe_id}
            onChange={(event) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                tribe_id: event.target.value,
                participant_id: '',
              }))
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todos os quartos</option>
            {tribes.map((tribe) => (
              <option key={tribe.id} value={tribe.id}>
                {tribe.name}
              </option>
            ))}
          </select>

          <select
            name="participant_id"
            value={filters.participant_id}
            onChange={handleFilterChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todos os participantes</option>
            {filterParticipants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.full_name}
              </option>
            ))}
          </select>

          <select
            name="type"
            value={filters.type}
            onChange={(event) =>
              setFilters((currentFilters) => ({
                ...currentFilters,
                type: event.target.value,
                category: '',
              }))
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todos os tipos</option>
            <option value="POINT">Pontos</option>
            <option value="PENALTY">Penalidades</option>
          </select>

          <select
            name="category"
            value={filters.category}
            onChange={handleFilterChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todas as categorias</option>
            {filterCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <p className="text-zinc-400">Carregando pontuações...</p>
        ) : (
          <ResponsiveTable
            columns={columns}
            data={filteredEvents}
            emptyMessage="Nenhuma pontuação encontrada."
          />
        )}
      </div>
    </section>
  )
}
