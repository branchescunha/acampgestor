import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActiveCampNotice from '../components/ActiveCampNotice'
import PageHeader from '../components/PageHeader'
import ResponsiveTable from '../components/ResponsiveTable'
import { normalizeScoreAmount } from '../domain/scoring'
import { createOperationGuard } from '../features/scoringOperations'
import {
  createResultOperation,
  isIntegerPoints,
} from '../features/eventOperations'
import { useActiveCamp } from '../hooks/useActiveCamp'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

const initialForm = {
  tribe_id: '',
  inspection_day: 'Sexta',
  inspection_period: 'Noite',
  type: 'POINT',
  points: '',
  notes: '',
  has_photo: false,
}

const availablePeriods = {
  Sexta: ['Noite'],
  Sábado: ['Manhã', 'Tarde', 'Noite'],
  Domingo: ['Manhã', 'Tarde'],
}

const inspectionSchedule = {
  Sexta: ['Noite'],
  Sábado: ['Manhã', 'Tarde', 'Noite'],
  Domingo: ['Manhã', 'Tarde'],
}

export default function Inspections() {
  const [tribes, setTribes] = useState([])
  const [competitionTeams, setCompetitionTeams] = useState([])
  const [inspections, setInspections] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const operationGuard = useRef(createOperationGuard())
  const resultOperation = useRef(createResultOperation(supabase))
  const { activeCampId } = useActiveCamp()
  const requestConfirmation = useConfirm()
  const { showError } = useToast()

  const loadData = useCallback(
    async (shouldIgnore = () => false) => {
      setLoading(true)
      if (!activeCampId) {
        if (shouldIgnore()) return
        setTribes([])
        setCompetitionTeams([])
        setInspections([])
        setLoading(false)
        return
      }

      const { data: tribesData, error: tribesError } = await supabase
        .from('tribes')
        .select(
          'id, camp_id, name, color, symbol, room_name, room_type, competition_team_id'
        )
        .eq('camp_id', activeCampId)
        .order('name')

      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('room_inspections')
        .select(
          `
        *,
        tribes (
          name,
          color,
          symbol,
          room_name,
          room_type,
          competition_team_id
        )
      `
        )
        .eq('camp_id', activeCampId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      const { data: teamsData, error: teamsError } = await supabase
        .from('competition_teams')
        .select('id, name')
        .eq('camp_id', activeCampId)

      if (tribesError || inspectionsError || teamsError) {
        logError('Inspections', tribesError || inspectionsError || teamsError)
        if (shouldIgnore()) return
        setLoading(false)
        return
      }

      if (shouldIgnore()) return

      setTribes(tribesData || [])
      setCompetitionTeams(teamsData || [])
      setInspections(inspectionsData || [])
      setLoading(false)
    },
    [activeCampId]
  )

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

  function handleChange(event) {
    const { name, value, type, checked } = event.target

    if (name === 'inspection_day') {
      setForm((currentForm) => ({
        ...currentForm,
        inspection_day: value,
        inspection_period: availablePeriods[value][0],
      }))

      return
    }

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleEdit(inspection) {
    if (saving) return
    setEditingId(inspection.id)

    setForm({
      tribe_id: inspection.tribe_id || '',
      inspection_day: inspection.inspection_day || 'Sexta',
      inspection_period: inspection.inspection_period || 'Noite',
      type: inspection.type || 'POINT',
      points: Math.abs(Number(inspection.points || 0)),
      notes: inspection.notes || '',
      has_photo: inspection.has_photo || false,
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!activeCampId) {
      showError('Selecione um acampamento antes de lançar inspeções.')
      return
    }

    if (!form.tribe_id) {
      showError('Selecione um quarto.')
      return
    }

    const selectedRoom = tribes.find((tribe) => tribe.id === form.tribe_id)
    if (!selectedRoom) {
      showError('Selecione um quarto deste acampamento.')
      return
    }

    if (
      !selectedRoom.competition_team_id ||
      !competitionTeams.some(
        (team) => team.id === selectedRoom.competition_team_id
      )
    ) {
      showError('Vincule o quarto a uma equipe antes de lançar a inspeção.')
      return
    }

    if (!availablePeriods[form.inspection_day]) {
      showError('Selecione o dia da inspeção.')
      return
    }

    if (
      !availablePeriods[form.inspection_day].includes(form.inspection_period)
    ) {
      showError('Selecione o período da inspeção.')
      return
    }

    if (!['POINT', 'PENALTY'].includes(form.type)) {
      showError('Selecione um tipo válido de inspeção.')
      return
    }

    const signedPoints = normalizeScoreAmount(form.type, form.points)
    if (!isIntegerPoints(form.points) || !isIntegerPoints(signedPoints)) {
      showError('Informe uma quantidade inteira válida de pontos.')
      return
    }

    if (!operationGuard.current.acquire()) return
    setSaving(true)

    try {
      const payload = {
        tribe_id: form.tribe_id,
        inspection_day: form.inspection_day,
        inspection_period: form.inspection_period,
        type: form.type,
        points: signedPoints,
        has_photo: form.has_photo,
        notes: form.notes.trim() || null,
      }

      await resultOperation.current.execute({
        campId: activeCampId,
        kind: 'inspection',
        action: 'save',
        recordId: editingId,
        payload,
      })

      setForm(initialForm)
      setEditingId(null)
      await loadData()
    } catch (error) {
      logError('Inspections', error)
      showError(
        'Não foi possível confirmar a operação. Tente novamente sem alterar os dados para repetir a mesma tentativa.'
      )
    } finally {
      operationGuard.current.release()
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!activeCampId || !editingId) return
    if (!operationGuard.current.acquire()) return
    setSaving(true)

    try {
      const confirmDelete = await requestConfirmation({
        title: 'Excluir inspeção',
        description:
          'Tem certeza que deseja excluir esta inspeção? Os pontos vinculados serão anulados, preservando o histórico.',
        confirmLabel: 'Excluir',
      })
      if (!confirmDelete) return

      await resultOperation.current.execute({
        campId: activeCampId,
        kind: 'inspection',
        action: 'delete',
        recordId: editingId,
      })

      setForm(initialForm)
      setEditingId(null)
      await loadData()
    } catch (error) {
      logError('Inspections', error)
      showError(
        'Não foi possível confirmar a exclusão. Tente novamente para repetir a mesma tentativa.'
      )
    } finally {
      operationGuard.current.release()
      setSaving(false)
    }
  }

  const inspectionStatus = useMemo(() => {
    const statusMap = {}

    tribes.forEach((tribe) => {
      statusMap[tribe.id] = {}

      Object.entries(inspectionSchedule).forEach(([day, periods]) => {
        periods.forEach((period) => {
          const key = `${day}-${period}`

          statusMap[tribe.id][key] = inspections.some(
            (inspection) =>
              inspection.tribe_id === tribe.id &&
              inspection.inspection_day === day &&
              inspection.inspection_period === period
          )
        })
      })
    })

    return statusMap
  }, [tribes, inspections])

  const activeTribes = useMemo(() => {
    return [...tribes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [tribes])

  function getRoomLabel(tribe) {
    if (!tribe) return 'Quarto não encontrado'
    const team = competitionTeams.find(
      (item) => item.id === tribe.competition_team_id
    )
    return `${tribe.room_name || tribe.name} / ${team?.name || 'Sem equipe vinculada'}`
  }

  const columns = [
    {
      key: 'date',
      label: 'Data',
      render: (inspection) => (
        <span className="text-zinc-400">
          {new Date(inspection.created_at).toLocaleString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'tribe',
      label: 'Quarto / equipe',
      render: (inspection) => (
        <div className="flex items-center justify-end gap-3 md:justify-start">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: inspection.tribes?.color }}
          >
            {inspection.tribes?.symbol}
          </div>

          <span>{getRoomLabel(inspection.tribes)}</span>
        </div>
      ),
    },
    {
      key: 'day',
      label: 'Dia',
      render: (inspection) => (
        <span className="text-zinc-300">{inspection.inspection_day}</span>
      ),
    },
    {
      key: 'period',
      label: 'Período',
      render: (inspection) => (
        <span className="text-zinc-400">{inspection.inspection_period}</span>
      ),
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (inspection) => (
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            inspection.type === 'POINT'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {inspection.type === 'POINT' ? 'Pontuação' : 'Penalidade'}
        </span>
      ),
    },
    {
      key: 'points',
      label: 'Pontos',
      render: (inspection) => (
        <strong
          className={
            Number(inspection.points) >= 0 ? 'text-green-400' : 'text-red-400'
          }
        >
          {Number(inspection.points) > 0 ? '+' : ''}
          {inspection.points}
        </strong>
      ),
    },
    {
      key: 'photo',
      label: 'Foto',
      render: (inspection) => (
        <span className="text-zinc-400">
          {inspection.has_photo ? 'Sim' : 'Não'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Ações',
      render: (inspection) => (
        <button
          type="button"
          onClick={() => handleEdit(inspection)}
          disabled={saving}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800"
        >
          Editar
        </button>
      ),
    },
  ]

  return (
    <section>
      <PageHeader
        eyebrow="Gestão"
        title="Inspeções de quartos"
        description="Controle operacional das inspeções dos quartos."
      />

      {!activeCampId && (
        <div className="mb-6">
          <ActiveCampNotice message="Selecione um acampamento para lançar e consultar inspeções." />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6"
      >
        <h2 className="text-xl font-bold">
          {editingId ? 'Editar inspeção' : 'Nova inspeção'}
        </h2>

        <fieldset disabled={saving}>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              name="tribe_id"
              value={form.tribe_id}
              onChange={handleChange}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            >
              <option value="">Selecione o quarto / equipe</option>

              {activeTribes.map((tribe) => (
                <option
                  key={tribe.id}
                  value={tribe.id}
                  disabled={!tribe.competition_team_id}
                >
                  {getRoomLabel(tribe)}
                </option>
              ))}
            </select>

            <select
              name="inspection_day"
              value={form.inspection_day}
              onChange={handleChange}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            >
              <option value="Sexta">Sexta</option>
              <option value="Sábado">Sábado</option>
              <option value="Domingo">Domingo</option>
            </select>

            <select
              name="inspection_period"
              value={form.inspection_period}
              onChange={handleChange}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            >
              {availablePeriods[form.inspection_day]?.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>

            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            >
              <option value="POINT">Pontuação</option>
              <option value="PENALTY">Penalidade</option>
            </select>

            <input
              name="points"
              value={form.points}
              onChange={handleChange}
              type="number"
              step="1"
              placeholder="Quantidade de pontos"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
            />

            <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
              <input
                type="checkbox"
                name="has_photo"
                checked={form.has_photo}
                onChange={handleChange}
                className="h-4 w-4"
              />
              Possui foto da inspeção
            </label>
          </div>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Observações (opcional)"
            className="mt-4 min-h-24 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
          />

          <div className="mt-4 flex flex-col justify-end gap-3 sm:flex-row">
            {editingId && (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
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
                  : 'Cadastrar inspeção'}
            </button>
          </div>
        </fieldset>
      </form>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
        <h2 className="text-xl font-bold">Status das inspeções</h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeTribes.map((tribe) => (
            <div
              key={tribe.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-lg"
                  style={{ backgroundColor: tribe.color }}
                >
                  {tribe.symbol}
                </div>

                <div>
                  <h3 className="font-bold">{getRoomLabel(tribe)}</h3>

                  <p className="text-sm text-zinc-500">
                    {tribe.room_name
                      ? `Quarto ${tribe.room_name}`
                      : 'Quarto não definido'}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {Object.entries(inspectionSchedule).map(([day, periods]) => (
                  <div key={day}>
                    <p className="mb-2 font-medium text-zinc-300">{day}</p>

                    <div className="space-y-1">
                      {periods.map((period) => {
                        const key = `${day}-${period}`
                        const completed = inspectionStatus[tribe.id]?.[key]

                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-zinc-400">{period}</span>

                            <span
                              className={
                                completed ? 'text-green-400' : 'text-red-400'
                              }
                            >
                              {completed ? 'Lançada' : 'Pendente'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <p className="text-zinc-400">Carregando inspeções...</p>
        ) : (
          <ResponsiveTable
            columns={columns}
            data={inspections}
            emptyMessage="Nenhuma inspeção cadastrada."
          />
        )}
      </div>
    </section>
  )
}
