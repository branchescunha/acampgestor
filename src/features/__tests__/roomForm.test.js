import assert from 'node:assert/strict'
import test from 'node:test'
import { ROOM_TYPES, getRoomColor, validateRoomType } from '../rooms/roomForm.js'
test('novos quartos exigem exclusivamente Masculino ou Feminino', () => {
  assert.deepEqual(ROOM_TYPES, ['Masculino', 'Feminino'])
  for (const type of ROOM_TYPES) assert.equal(validateRoomType(type), '')
  for (const type of ['', 'Outros', 'Misto']) assert.ok(validateRoomType(type))
})
test('edicao preserva tipo legado, sem permitir novo valor arbitrario', () => {
  assert.equal(validateRoomType('UPA Boys', 'UPA Boys', true), '')
  assert.equal(validateRoomType('', null, true), '')
  assert.ok(validateRoomType('Outro legado', 'UPA Boys', true))
})
test('cor deriva da equipe atual do mesmo acampamento, nao da cor antiga do quarto', () => {
  const room = { camp_id: 'a', competition_team_id: 't1', color: '#000000' }
  assert.equal(getRoomColor(room, [{ id: 't1', camp_id: 'a', color: '#ff0000' }]), '#ff0000')
  assert.equal(getRoomColor(room, [{ id: 't1', camp_id: 'a', color: '#00ff00' }]), '#00ff00')
  assert.equal(getRoomColor(room, [{ id: 't1', camp_id: 'b', color: '#ff0000' }]), '#000000')
})
