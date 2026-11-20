import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  buildScorePayload,
  filterScoreEvents,
  initialScoreFilters,
  initialScoreForm,
  isLegacyScoreEditing,
  validateScoreForm,
} from '../scoreForm.js'

test('validateScoreForm requires a competition team for new scores', () => {
  assert.equal(
    validateScoreForm(initialScoreForm, 'camp-1', false),
    'Selecione uma equipe.',
  )
})

test('validateScoreForm rejects non-finite and non-positive amounts', () => {
  for (const points of ['NaN', 'Infinity', '-Infinity', '0', '-1', '0.5', '2147483648']) {
    assert.ok(validateScoreForm({
      ...initialScoreForm,
      competition_team_id: 'team-1',
      category: 'Geral',
      points,
    }, 'camp-1'))
  }
})

test('new manual scores require an explicit reason', () => {
  const form = { ...initialScoreForm, competition_team_id: 'team-1', category: 'Outro', points: '5' }
  assert.equal(validateScoreForm(form, 'camp-1'), 'Informe o motivo do lançamento.')
  assert.equal(validateScoreForm({ ...form, reason: 'Participação' }, 'camp-1'), '')
})

test('validateScoreForm allows legacy editing with tribe only', () => {
  assert.equal(
    validateScoreForm(
      { ...initialScoreForm, tribe_id: 'tribe-1', category: 'Geral', points: '5' },
      'camp-1',
      true,
    ),
    '',
  )
})

test('buildScorePayload keeps competitive and legacy destinations explicit', () => {
  const competitivePayload = buildScorePayload(
    {
      ...initialScoreForm,
      competition_team_id: 'team-1',
      category: 'Geral',
      points: '10',
    },
    'camp-1',
    false,
  )
  const legacyPayload = buildScorePayload(
    { ...initialScoreForm, tribe_id: 'tribe-1', category: 'Geral', points: '10' },
    'camp-1',
    true,
  )

  assert.equal(competitivePayload.competition_team_id, 'team-1')
  assert.equal(competitivePayload.tribe_id, null)
  assert.equal(legacyPayload.tribe_id, 'tribe-1')
  assert.equal(legacyPayload.competition_team_id, null)
})

test('isLegacyScoreEditing detects legacy tribe-only edits', () => {
  assert.equal(
    isLegacyScoreEditing('score-1', {
      ...initialScoreForm,
      tribe_id: 'tribe-1',
    }),
    true,
  )
})

test('filterScoreEvents filters by competition team and search text', () => {
  const events = [
    {
      reason: 'Prova',
      competition_team_id: 'team-1',
      competition_teams: { name: 'Time Azul' },
    },
    {
      reason: 'Outro',
      competition_team_id: 'team-2',
      competition_teams: { name: 'Time Verde' },
    },
  ]

  assert.deepEqual(
    filterScoreEvents(events, {
      search: 'azul',
      competition_team_id: 'team-1',
      tribe_id: '',
      participant_id: '',
      type: '',
      category: '',
    }),
    [events[0]],
  )
})

test('team filter includes legacy room scores using the same destination as totals', () => {
  const legacy = { tribe_id: 'room-1', competition_team_id: null,
    tribes: { competition_team_id: 'team-1' }, points: 10 }
  const direct = { competition_team_id: 'team-1', points: -5 }
  const unrelated = { competition_team_id: 'team-2', points: 20 }
  assert.deepEqual(filterScoreEvents([legacy, direct, unrelated], {
    ...initialScoreFilters, competition_team_id: 'team-1',
  }), [legacy, direct])
})

test('explicit score team takes precedence over a legacy room association', () => {
  const score = { competition_team_id: 'team-2', tribes: { competition_team_id: 'team-1' } }
  assert.deepEqual(filterScoreEvents([score], {
    ...initialScoreFilters, competition_team_id: 'team-1',
  }), [])
})

test('initial and post-save score queries retain the legacy room team for filtering', () => {
  const source = readFileSync(new URL('../../../pages/Scores.jsx', import.meta.url), 'utf8')
  const queries = [...source.matchAll(/\.from\('score_events'\)[\s\S]*?\.select\(\s*`([\s\S]*?)`/g)]
  assert.equal(queries.length, 2)
  for (const [, columns] of queries) {
    assert.match(columns, /tribes\s*\([^)]*competition_team_id/)
  }
})
