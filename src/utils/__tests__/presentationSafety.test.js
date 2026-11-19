import test from 'node:test'
import assert from 'node:assert/strict'
import { countGraphemes, validateSymbol } from '../symbols.js'
import { actorName } from '../actors.js'
import { createReadTimeoutFetch, connectionMessage } from '../network.js'
import { filterParticipantRooms } from '../../features/participants/participantForm.js'
import { getInspectionRoomOptions } from '../../features/inspections/inspectionSchedule.js'

test('symbols count composed emoji, flags and accents as visual characters', () => {
  for (const segmenter of [Intl.Segmenter, null]) {
    for (const value of ['👨‍👩‍👧‍👦', '🇧🇷', '👍🏽', 'e\u0301', '1️⃣']) {
      assert.equal(countGraphemes(value, segmenter), 1, value)
    }
    assert.equal(countGraphemes('1A🏆', segmenter), 3)
  }
  assert.equal(validateSymbol('1234').length > 0, true)
  assert.equal(validateSymbol('historical', 'historical'), '')
  assert.equal(validateSymbol('123'), '')
})

test('actor presentation never falls back to identifiers or emails', () => {
  assert.equal(
    actorName('private-id', [{ id: 'private-id', name: 'Diretoria' }]),
    'Diretoria'
  )
  assert.equal(actorName('private-id', []), 'Conta não identificada')
  assert.equal(actorName(null, []), 'Conta não identificada')
})

test('inactive rooms cannot be selected for new participants or inspections; historical assignments remain editable', () => {
  const rooms = [
    {
      id: 'active',
      camp_id: 'camp',
      competition_team_id: 'team',
      is_active: true,
    },
    {
      id: 'inactive',
      camp_id: 'camp',
      competition_team_id: 'team',
      is_active: false,
    },
    {
      id: 'other',
      camp_id: 'other',
      competition_team_id: 'team',
      is_active: true,
    },
  ]
  const teams = [{ id: 'team', camp_id: 'camp' }]
  assert.deepEqual(
    filterParticipantRooms(rooms, 'team', 'camp').map((room) => room.id),
    ['active']
  )
  assert.deepEqual(
    getInspectionRoomOptions(rooms, teams, 'camp', 'team').map(
      (room) => room.id
    ),
    ['active']
  )
  assert.equal(
    filterParticipantRooms(rooms, 'team', 'camp', 'inactive').length,
    2
  )
  assert.equal(
    getInspectionRoomOptions(rooms, teams, 'camp', 'team', 'inactive').length,
    2
  )
})

test('only PostgREST reads receive timeouts, writes are never retried', async () => {
  let calls = 0
  const pendingFetch = (_url, options) => {
    calls++
    return new Promise((_, reject) =>
      options.signal.addEventListener(
        'abort',
        () => reject(options.signal.reason),
        { once: true }
      )
    )
  }
  const read = createReadTimeoutFetch(pendingFetch, 10)
  await assert.rejects(
    read('https://fixture.invalid/rest/v1/camps'),
    /Tempo limite/
  )
  assert.equal(calls, 1)
  let writeOptions
  const write = createReadTimeoutFetch(async (_url, options) => {
    writeOptions = options
    return 'ok'
  }, 10)
  assert.equal(
    await write('https://fixture.invalid/rest/v1/rpc/save_camp_result', {
      method: 'POST',
    }),
    'ok'
  )
  assert.equal(writeOptions.signal, undefined)
  assert.match(connectionMessage({ status: 401 }), /sessão/)
  assert.match(connectionMessage({}, false), /internet/)
})
