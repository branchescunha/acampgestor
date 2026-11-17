import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildParticipantPayload,
  filterParticipants,
  filterParticipantRooms,
  initialParticipantForm,
  selectParticipantTeam,
  validateParticipantForm,
} from '../participantForm.js'

test('validateParticipantForm preserves required participant fields', () => {
  assert.equal(
    validateParticipantForm(initialParticipantForm, ''),
    'Selecione um acampamento antes de cadastrar participantes.',
  )
  assert.equal(
    validateParticipantForm(initialParticipantForm, 'camp-1'),
    'Informe o nome do participante.',
  )
})

const validForm = {
  ...initialParticipantForm,
  full_name: 'Ana',
  gender: 'Feminino',
  group_type: 'UMP',
  competition_team_id: 'team-1',
  tribe_id: 'room-1',
}
const teams = [{ id: 'team-1', camp_id: 'camp-1', status: 'active' }]
const rooms = [{ id: 'room-1', camp_id: 'camp-1', competition_team_id: 'team-1' }]

test('selectParticipantTeam clears the room without mutating the current form', () => {
  for (const teamId of ['team-2', '']) {
    const result = selectParticipantTeam(validForm, teamId)
    assert.equal(result.competition_team_id, teamId)
    assert.equal(result.tribe_id, '')
    assert.equal(result.full_name, validForm.full_name)
    assert.equal(validForm.tribe_id, 'room-1')
    assert.equal(validForm.competition_team_id, 'team-1')
  }
})

test('filterParticipantRooms returns only rooms from the selected team and camp', () => {
  const allRooms = [
    ...rooms,
    { id: 'room-2', camp_id: 'camp-1', competition_team_id: 'team-2' },
    { id: 'room-3', camp_id: 'camp-2', competition_team_id: 'team-1' },
    { id: 'room-4', camp_id: 'camp-1', competition_team_id: null },
  ]
  assert.deepEqual(filterParticipantRooms(allRooms, 'team-1', 'camp-1'), rooms)
  assert.deepEqual(filterParticipantRooms(allRooms, '', 'camp-1'), [])
  assert.deepEqual(filterParticipantRooms(allRooms, 'team-1', ''), [])
  assert.deepEqual(filterParticipantRooms(allRooms, 'unknown', 'camp-1'), [])
})

test('validateParticipantForm requires an Equipe and Quarto even for legacy edits', () => {
  assert.equal(
    validateParticipantForm({ ...validForm, competition_team_id: '' }, 'camp-1', teams, rooms),
    'Selecione a equipe.',
  )
  assert.equal(
    validateParticipantForm({ ...validForm, tribe_id: '' }, 'camp-1', teams, rooms),
    'Selecione o quarto.',
  )
})

test('validateParticipantForm rejects unknown or cross-camp teams', () => {
  for (const invalidTeams of [[], [{ ...teams[0], camp_id: 'camp-2' }]]) {
    assert.equal(
      validateParticipantForm(validForm, 'camp-1', invalidTeams, rooms),
      'Selecione uma equipe válida deste acampamento.',
    )
  }
})

test('validateParticipantForm rejects unknown, unlinked, cross-camp or cross-team rooms', () => {
  for (const invalidRooms of [
    [],
    [{ ...rooms[0], competition_team_id: null }],
    [{ ...rooms[0], competition_team_id: 'team-2' }],
    [{ ...rooms[0], camp_id: 'camp-2' }],
  ]) {
    assert.equal(
      validateParticipantForm(validForm, 'camp-1', teams, invalidRooms),
      'Selecione um quarto válido da equipe e deste acampamento.',
    )
  }
})

test('validateParticipantForm accepts valid links without changing legacy data', () => {
  const legacy = { ...validForm, competition_team_id: null, tribe_id: null }
  const before = { ...legacy }
  assert.notEqual(validateParticipantForm(legacy, 'camp-1', teams, rooms), '')
  assert.deepEqual(legacy, before)
  assert.equal(validateParticipantForm(validForm, 'camp-1', teams, rooms), '')
  assert.equal(
    validateParticipantForm(validForm, 'camp-1', [{ ...teams[0], status: 'inactive' }], rooms),
    '',
  )
})

test('buildParticipantPayload preserves explicit Equipe and Quarto links', () => {
  const payload = buildParticipantPayload(
    {
      ...initialParticipantForm,
      full_name: ' Ana ',
      gender: 'Feminino',
      group_type: 'UMP',
      tribe_id: 'tribe-1',
      competition_team_id: 'team-1',
    },
    'camp-1',
  )

  assert.equal(payload.tribe_id, 'tribe-1')
  assert.equal(payload.competition_team_id, 'team-1')
  assert.equal(payload.camp_id, 'camp-1')
  assert.equal(payload.full_name, 'Ana')
})

test('filterParticipants supports Sem equipe for legacy records without changing room filters', () => {
  const participants = [
    { full_name: 'Ana', tribe_id: 'a', competition_team_id: null, is_active: true },
    { full_name: 'Bia', tribe_id: 'a', competition_team_id: 'team-1', is_active: true },
  ]

  assert.deepEqual(
    filterParticipants(participants, {
      search: '',
      tribe_id: 'a',
      competition_team_id: 'none',
      group_type: '',
      gender: '',
      age: '',
      shirt_size: '',
      board: '',
      status: '',
    }),
    [participants[0]],
  )
})
