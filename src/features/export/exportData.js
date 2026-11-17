import { supabase } from '../../lib/supabase'
import { loadCampScoreTotals } from '../scores/scoreTotals'

const tribeColumns =
  'id, camp_id, competition_team_id, name, color, symbol, room_type, room_name, leader_name, is_active, created_at'

const competitionTeamColumns =
  'id, camp_id, name, color, symbol, leader_name, status, created_at, updated_at'

const participantColumns = `
  id,
  camp_id,
  full_name,
  birth_date,
  age,
  church,
  cpf,
  address,
  shirt_size,
  gender,
  group_type,
  gymkhana_team,
  phone,
  guardian_phone,
  food_restriction,
  notes,
  is_board_member,
  is_active,
  tribe_id,
  competition_team_id,
  created_at,
  tribes (
    name,
    symbol,
    color
  ),
  competition_teams (
    name,
    symbol,
    color,
    status
  )
`

const scoreEventColumns = `
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
  is_voided,
  created_by,
  voided_at,
  voided_by,
  created_at,
  tribes (
    name,
    symbol,
    color
  ),
  competition_teams (
    name,
    symbol,
    color,
    status
  ),
  participants (
    full_name
  )
`

const inspectionColumns = `
  id,
  camp_id,
  tribe_id,
  inspection_day,
  inspection_period,
  type,
  points,
  notes,
  has_photo,
  deleted_at,
  created_at,
  tribes (
    name,
    symbol,
    color,
    room_name,
    room_type
  )
`

async function loadAllRows(query) {
  const pageSize = 100
  const rows = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

export async function loadExportData(exportCampId) {
  const [
    tribesResult,
    competitionTeamsResult,
    participantsResult,
    eventsResult,
    gymkhanaResult,
    inspectionsResult,
    settingsResult,
    totalsResult,
  ] = await Promise.all([
    loadAllRows(
      supabase
        .from('tribes')
        .select(tribeColumns)
        .eq('camp_id', exportCampId)
        .order('name')
        .order('id'),
    ),
    loadAllRows(
      supabase
        .from('competition_teams')
        .select(competitionTeamColumns)
        .eq('camp_id', exportCampId)
        .order('status', { ascending: true })
        .order('name', { ascending: true })
        .order('id'),
    ),
    loadAllRows(
      supabase
        .from('participants')
        .select(participantColumns)
        .eq('camp_id', exportCampId)
        .order('full_name')
        .order('id'),
    ),
    loadAllRows(
      supabase
        .from('score_events')
        .select(scoreEventColumns)
        .eq('camp_id', exportCampId)
        .order('created_at', { ascending: false })
        .order('id'),
    ),
    loadAllRows(
      supabase
        .from('gymkhana_events')
        .select(
          'id, camp_id, title, winning_team, winning_competition_team_id, points_per_member, awards, notes, deleted_at, created_at',
        )
        .eq('camp_id', exportCampId)
        .order('created_at', { ascending: false })
        .order('id'),
    ),
    loadAllRows(
      supabase
        .from('room_inspections')
        .select(inspectionColumns)
        .eq('camp_id', exportCampId)
        .order('created_at', { ascending: false })
        .order('id'),
    ),
    supabase
      .from('gymkhana_settings')
      .select('id, camp_id, team_a_name, team_b_name')
      .eq('camp_id', exportCampId)
      .limit(1),
    loadCampScoreTotals(supabase, 'camp_score_totals', exportCampId),
  ])

  const error =
    tribesResult.error ||
    competitionTeamsResult.error ||
    participantsResult.error ||
    eventsResult.error ||
    gymkhanaResult.error ||
    inspectionsResult.error ||
    settingsResult.error ||
    totalsResult.error

  if (error) throw error

  return {
    tribes: tribesResult.data || [],
    competitionTeams: competitionTeamsResult.data || [],
    participants: participantsResult.data || [],
    events: eventsResult.data || [],
    gymkhana: gymkhanaResult.data || [],
    inspections: inspectionsResult.data || [],
    settings: settingsResult.data?.[0] || {},
    totals: totalsResult.data || [],
  }
}
