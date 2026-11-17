import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRanking } from '../../../domain/ranking.js'
import { loadCampScoreTotals, totalsAsScoreEntries } from '../scoreTotals.js'

test('aggregates preserve positive points, penalties, totals and ranking tie-breaks', () => {
  const entries = totalsAsScoreEntries([
    { competition_team_id: 'a', positive_points: '20', penalty_points: '5' },
    { competition_team_id: 'b', positive_points: '17', penalty_points: '2' },
  ])
  const ranking = calculateRanking([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], entries, [], {
    includeInactive: true, scoreTeamIdField: 'competition_team_id',
  })
  assert.deepEqual(ranking.map((team) => [team.id, team.total, team.penaltyPoints]), [['b', 15, 2], ['a', 15, 5]])
})

test('loads every aggregate page for the requested camp and propagates failures', async () => {
  const calls = []
  const client = {
    from(view) {
      return { select: () => ({ eq: (column, camp) => ({ order: () => ({
        range(start) {
          calls.push({ view, column, camp, start })
          return Promise.resolve({ data: start === 0 ? Array(100).fill({}) : [{}], error: null })
        },
      }) }) }) }
    },
  }
  const result = await loadCampScoreTotals(client, 'camp_score_totals', 'camp-a')
  assert.equal(result.data.length, 101)
  assert.deepEqual(calls.map((call) => call.start), [0, 100])
  assert.ok(calls.every((call) => call.camp === 'camp-a'))
})

test('does not return partial totals when a page fails', async () => {
  const error = new Error('query failed')
  const query = {
    select() { return this }, eq() { return this }, order() { return this },
    range() { return Promise.resolve({ data: null, error }) },
  }
  assert.deepEqual(await loadCampScoreTotals({ from: () => query }, 'totals', 'camp-a'), { data: null, error })
})
