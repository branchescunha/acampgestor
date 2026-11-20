export function withRankingPositions(ranking = []) {
  const active = ranking.filter(team => team.isActive)
  const inactive = ranking.filter(team => !team.isActive)
  return [
    ...active.map((team, index) => ({ ...team, position: index + 1 })),
    ...inactive.map(team => ({ ...team, position: null })),
  ]
}
