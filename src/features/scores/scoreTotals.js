const PAGE_SIZE = 100

export async function readAllPages(createQuery) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await createQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}

export async function loadCampScoreTotals(client, view, campId) {
  return readAllPages(() => client.from(view)
      .select('competition_team_id, positive_points, penalty_points, total, participants_count')
      .eq('camp_id', campId)
      .order('competition_team_id')
  )
}

export function totalsAsScoreEntries(totals = []) {
  return totals.flatMap((row) => [
    { competition_team_id: row.competition_team_id, points: Number(row.positive_points) },
    { competition_team_id: row.competition_team_id, points: -Number(row.penalty_points) },
  ])
}
