import { useCallback, useEffect, useMemo, useState } from 'react'
import ActiveCampNotice from '../components/ActiveCampNotice'
import PageHeader from '../components/PageHeader'
import { useActiveCamp } from '../hooks/useActiveCamp'
import { useConfirm } from '../hooks/useConfirm'
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

const roomTypes = ['Masculino', 'Feminino', 'Outros']

const initialForm = {
  name: '',
  symbol: '',
  color: '#eab308',
  room_type: '',
  room_name: '',
  leader_name: '',
  competition_team_id: '',
}

const initialFilters = {
  search: '',
  status: '',
  room_type: '',
}

export default function CampGroups() {
  const [tribes, setTribes] = useState([])
  const [teams, setTeams] = useState([])
  const [participants, setParticipants] = useState([])
  const [form, setForm] = useState(initialForm)
  const [filters, setFilters] = useState(initialFilters)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { activeCampId } = useActiveCamp()
  const requestConfirmation = useConfirm()
  const { showError } = useToast()

  useEffect(() => {
    let shouldIgnore = false

    async function loadData() {
      setLoading(true)

      const { data: tribesData, error: tribesError } = await supabase
        .from('tribes')
        .select(
          'id, camp_id, name, symbol, color, room_type, room_name, leader_name, competition_team_id, is_active, created_at',
        )
        .eq('camp_id', activeCampId)
        .order('name')

      const { data: participantsData, error: participantsError } =
        await supabase
          .from('participants')
          .select('id, camp_id, full_name, tribe_id, gender, group_type, is_active')
          .eq('camp_id', activeCampId)
          .eq('is_active', true)
          .order('full_name')

      const { data: teamsData, error: teamsError } = await supabase
        .from('competition_teams')
        .select('id, camp_id, name, status')
        .eq('camp_id', activeCampId)
        .order('name')

      if (tribesError || participantsError || teamsError) {
        logError('CampGroups', tribesError || participantsError || teamsError)
        if (shouldIgnore) return
        setTribes([])
        setParticipants([])
        setTeams([])
        showError('Erro ao carregar quartos, equipes e participantes.')
        setLoading(false)
        return
      }

      if (shouldIgnore) return

      setTribes(tribesData || [])
      setParticipants(participantsData || [])
      setTeams(teamsData || [])
      setLoading(false)
    }

    if (activeCampId) {
      loadData()
      return () => {
        shouldIgnore = true
      }
    }

    const timeoutId = window.setTimeout(() => {
      setTribes([])
      setParticipants([])
      setTeams([])
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

    return () => window.clearTimeout(timeoutId)
  }, [activeCampId])

  async function reloadTribes() {
    const { data, error } = await supabase
      .from('tribes')
      .select(
        'id, camp_id, name, symbol, color, room_type, room_name, leader_name, competition_team_id, is_active, created_at',
      )
      .eq('camp_id', activeCampId)
      .order('name')

    if (error) {
      logError('CampGroups', error)
      return
    }

    setTribes(data || [])
  }

  function handleChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
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
    setFilters(initialFilters)
  }

  const getTribeParticipants = useCallback((tribeId) => {
    return participants.filter(
      (participant) => participant.tribe_id === tribeId
    )
  }, [participants])

  const getActiveStatus = useCallback((tribeId) => {
    return getTribeParticipants(tribeId).length > 0
  }, [getTribeParticipants])

  function handleEdit(tribe) {
    setEditingId(tribe.id)

    setForm({
      name: tribe.name || '',
      symbol: tribe.symbol || '',
      color: tribe.color || '#eab308',
      room_type: tribe.room_type || '',
      room_name: tribe.room_name || '',
      leader_name: tribe.leader_name || '',
      competition_team_id: tribe.competition_team_id || '',
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleDelete() {
    const confirmDelete = await requestConfirmation({
      title: 'Excluir quarto',
      description:
        'Tem certeza que deseja excluir este quarto? Essa ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
    })

    if (!confirmDelete) return

    const { error } = await supabase
      .from('tribes')
      .delete()
      .eq('id', editingId)
      .eq('camp_id', activeCampId)

    if (error) {
      logError('CampGroups', error)
      showError('Erro ao excluir quarto.')
      return
    }

    setEditingId(null)
    setForm(initialForm)
    await reloadTribes()
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!activeCampId) {
      showError('Selecione um acampamento antes de cadastrar quartos.')
      return
    }

    if (!form.name.trim()) {
      showError('Informe o nome do quarto.')
      return
    }

    if (
      !teams.some(
        (team) => team.id === form.competition_team_id && team.camp_id === activeCampId,
      )
    ) {
      showError('Selecione uma equipe deste acampamento para o quarto.')
      return
    }

    setSaving(true)

    const payload = {
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      color: form.color,
      room_type: form.room_type.trim() || null,
      competition_team_id: form.competition_team_id,
      room_name: form.room_name.trim() || null,
      leader_name: form.leader_name.trim() || null,
      is_active: editingId ? getActiveStatus(editingId) : false,
      camp_id: activeCampId,
    }

    const request = editingId
      ? supabase
          .from('tribes')
          .update(payload)
          .eq('id', editingId)
          .eq('camp_id', activeCampId)
      : supabase.from('tribes').insert(payload)

    const { error } = await request

    if (error) {
      logError('CampGroups', error)
      showError('Erro ao salvar quarto.')
      setSaving(false)
      return
    }

    setForm(initialForm)
    setEditingId(null)
    await reloadTribes()
    setSaving(false)
  }

  const selectedColor = colorOptions.find((color) => color.value === form.color)

  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  )
  const filterRoomTypes = [
    ...new Set([...roomTypes, ...tribes.map((tribe) => tribe.room_type).filter(Boolean)]),
  ]

  const filteredAndSortedTribes = useMemo(() => {
    return [...tribes]
      .filter((tribe) => {
        const activeStatus = getActiveStatus(tribe.id)
        const search = filters.search.trim().toLowerCase()

        const matchesSearch = search
          ? tribe.name?.toLowerCase().includes(search) ||
            tribe.leader_name?.toLowerCase().includes(search) ||
            tribe.room_name?.toLowerCase().includes(search) ||
            tribe.room_type?.toLowerCase().includes(search)
          : true

        const matchesStatus = filters.status
          ? filters.status === 'active'
            ? activeStatus
            : !activeStatus
          : true

        const matchesRoomType = filters.room_type
          ? tribe.room_type === filters.room_type
          : true

        return matchesSearch && matchesStatus && matchesRoomType
      })
      .sort((a, b) => {
        const aActive = getActiveStatus(a.id)
        const bActive = getActiveStatus(b.id)

        if (aActive !== bActive) {
          return aActive ? -1 : 1
        }

        return a.name.localeCompare(b.name, 'pt-BR')
      })
  }, [tribes, filters, getActiveStatus])

  const activeCount = tribes.filter((tribe) => getActiveStatus(tribe.id)).length

  return (
    <section>
      <PageHeader
        eyebrow="Gestão"
        title="Quartos"
        description="Gerenciamento dos quartos e de seus vínculos com as equipes do acampamento."
      />

      {!activeCampId && (
        <div className="mb-6">
          <ActiveCampNotice message="Selecione um acampamento para cadastrar e gerenciar quartos." />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6"
      >
        <h2 className="text-xl font-bold">
          {editingId ? 'Editar quarto' : 'Novo quarto'}
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Nome do quarto"
            aria-label="Nome do quarto"
            required
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />

          <input
            name="symbol"
            value={form.symbol}
            onChange={handleChange}
            placeholder="Símbolo"
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

          <input
            name="room_type"
            value={form.room_type}
            onChange={handleChange}
            list="room-types"
            aria-label="Tipo de quarto"
            placeholder="Tipo de quarto, opcional"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />
          <datalist id="room-types">
            {roomTypes.map((roomType) => (
              <option key={roomType} value={roomType} />
            ))}
          </datalist>

          <select
            name="competition_team_id"
            value={form.competition_team_id}
            onChange={handleChange}
            aria-label="Equipe do quarto"
            required
            disabled={loading || !activeCampId}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Selecione a equipe</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}{team.status === 'inactive' ? ' (inativa)' : ''}
              </option>
            ))}
          </select>

          <input
            name="room_name"
            value={form.room_name}
            onChange={handleChange}
            placeholder="Quarto / número, opcional"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />

          <input
            name="leader_name"
            value={form.leader_name}
            onChange={handleChange}
            placeholder="Responsável / líder"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>

        {!loading && activeCampId && teams.length === 0 && (
          <p className="mt-3 text-sm text-yellow-400" role="status">
            Nenhuma equipe cadastrada neste acampamento.
          </p>
        )}

        <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
          {editingId && (
            <>
              <button
                type="button"
                onClick={handleDelete}
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
            disabled={saving || loading || !activeCampId || teams.length === 0}
            className="rounded-xl bg-yellow-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Salvando...'
              : editingId
                ? 'Salvar alterações'
                : 'Cadastrar quarto'}
          </button>
        </div>
      </form>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-bold">Lista de quartos</h2>

            <p className="mt-2 text-sm text-zinc-400">
              {filteredAndSortedTribes.length} de {tribes.length} quarto(s)
              exibido(s). {activeCount} ativo(s).
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

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <input
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Buscar por quarto ou responsável"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500 xl:col-span-2"
          />

          <select
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>

          <select
            name="room_type"
            value={filters.room_type}
            onChange={handleFilterChange}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          >
            <option value="">Todos os tipos</option>
            {filterRoomTypes.map((roomType) => (
              <option key={roomType} value={roomType}>{roomType}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <p className="text-zinc-400">Carregando quartos...</p>
        ) : filteredAndSortedTribes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
            Nenhum quarto encontrado para este acampamento.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAndSortedTribes.map((tribe) => {
              const activeStatus = getActiveStatus(tribe.id)
              const membersCount = getTribeParticipants(tribe.id).length

              return (
                <article
                  key={tribe.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
                      style={{ backgroundColor: tribe.color }}
                    >
                      {tribe.symbol}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          activeStatus
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-zinc-700 text-zinc-300'
                        }`}
                      >
                        {activeStatus ? 'Ativo' : 'Inativo'}
                      </span>

                      {!teamsById.has(tribe.competition_team_id) && (
                        <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs text-yellow-300">
                          Vínculo pendente
                        </span>
                      )}
                    </div>
                  </div>

                  <h2 className="mt-6 text-2xl font-bold">{tribe.name}</h2>

                  <div className="mt-5 space-y-2 text-sm text-zinc-400">
                    <p>Equipe: {teamsById.get(tribe.competition_team_id)?.name || 'Vínculo pendente'}</p>
                    <p>Tipo de quarto: {tribe.room_type || 'Opcional'}</p>
                    <p>Quarto: {tribe.room_name || 'Opcional'}</p>
                    <p>Responsável: {tribe.leader_name || 'Não definido'}</p>
                    <p>Integrantes ativos: {membersCount}</p>
                  </div>

                  {membersCount > 0 && (
                    <details className="mt-4 text-sm text-zinc-300">
                      <summary className="cursor-pointer">Ver participantes</summary>
                      <ul className="mt-2 space-y-1">
                        {getTribeParticipants(tribe.id).map((participant) => (
                          <li key={participant.id}>{participant.full_name}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <button
                    type="button"
                    onClick={() => handleEdit(tribe)}
                    className="mt-6 w-full rounded-xl border border-zinc-700 py-3 text-sm text-zinc-300 transition hover:bg-zinc-800"
                  >
                    Editar
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
