import { readAllPages } from './scores/scoreTotals.js'

export async function loadCampResultHistory(client, table, campId, columns) {
  if (!campId) return { data: [], error: null }
  return readAllPages(() => client.from(table)
    .select(columns)
    .eq('camp_id', campId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id')
  )
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    )
  }
  return value
}

export function createResultOperation(client) {
  let pending = null

  return {
    async execute({ campId, kind, action, recordId = null, payload = {} }) {
      const rpc = kind === 'score' ? 'save_camp_score' : 'save_camp_result'
      const args = {
        p_camp_id: campId,
        ...(kind === 'score' ? {} : { p_kind: kind }),
        p_action: action,
        p_record_id: recordId,
        p_payload: payload,
      }
      const fingerprint = JSON.stringify(canonicalize({ rpc, kind, args }))
      if (pending?.fingerprint !== fingerprint) {
        pending = { fingerprint, token: globalThis.crypto.randomUUID() }
      }
      const attempt = pending
      const { data, error } = await client.rpc(rpc, {
        ...args,
        p_operation_id: attempt.token,
      })
      if (error) throw error
      if (!data?.id) throw new Error('Resposta invalida ao salvar resultado.')
      if (pending === attempt) pending = null
      return data
    },
  }
}

export function isIntegerPoints(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false
  if (typeof value === 'string' && !value.trim()) return false
  const points = Number(value)
  return (
    Number.isInteger(points) && points >= -2147483648 && points <= 2147483647
  )
}

export function validateGymkhanaAwards(awards, teams) {
  if (!Array.isArray(awards) || awards.length === 0) {
    return 'Selecione pelo menos uma equipe premiada.'
  }
  const selected = new Set()
  for (const award of awards) {
    if (!teams.some((team) => team.id === award.competition_team_id)) {
      return 'Selecione uma equipe deste acampamento para cada premio.'
    }
    if (selected.has(award.competition_team_id)) {
      return 'Uma equipe nao pode receber dois premios na mesma prova.'
    }
    if (!isIntegerPoints(award.points)) {
      return 'Informe pontos inteiros validos para cada equipe.'
    }
    selected.add(award.competition_team_id)
  }
  return null
}

export function getGymkhanaAwards(event) {
  if (Array.isArray(event.awards) && event.awards.length) return event.awards
  if (event.winning_competition_team_id) {
    return [
      {
        competition_team_id: event.winning_competition_team_id,
        points: event.points_per_member ?? 0,
      },
    ]
  }
  return []
}
