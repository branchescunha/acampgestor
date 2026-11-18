import assert from 'node:assert/strict'
import test from 'node:test'
import { ALL_INSPECTION_SLOTS, LEGACY_INSPECTION_SLOTS, getInspectionSchedule, isValidInspectionSchedule, toggleInspectionSlot, getInspectionRoomOptions, validateInspectionSelection, includeUsedInspectionSlots } from '../inspections/inspectionSchedule.js'

test('matriz possui exatamente 21 combinacoes independentes', () => {
  assert.equal(ALL_INSPECTION_SLOTS.length, 21)
  assert.equal(new Set(ALL_INSPECTION_SLOTS.map(s => `${s.day}/${s.period}`)).size, 21)
  assert.equal(isValidInspectionSchedule(ALL_INSPECTION_SLOTS), true)
})
test('configuracao nula preserva os seis turnos antigos; lista vazia nao ativa turnos', () => {
  assert.deepEqual(getInspectionSchedule(null), LEGACY_INSPECTION_SLOTS)
  assert.deepEqual(getInspectionSchedule([]), [])
})
test('selecionar/desmarcar nao altera as outras celulas nem o array original', () => {
  const original = [{ day: 'Sexta', period: 'Noite' }]
  const next = toggleInspectionSlot(original, 'Segunda', 'Manhã')
  assert.equal(next.length, 2)
  assert.equal(original.length, 1)
  assert.deepEqual(toggleInspectionSlot(next, 'Segunda', 'Manhã'), original)
})
test('configuracoes invalidas ou duplicadas sao rejeitadas', () => {
  for (const value of [{}, [{ day: 'Segunda', period: 'Madrugada' }], [{ day: 'Feriado', period: 'Noite' }], [ALL_INSPECTION_SLOTS[0], ALL_INSPECTION_SLOTS[0]]]) assert.equal(isValidInspectionSchedule(value), false)
  assert.equal(isValidInspectionSchedule([]), true)
})
test('turnos usados sao preservados sem inventar combinacoes para dados legados incompletos', () => {
  const used = [{ day: 'Segunda', period: 'Noite' }, { day: null, period: null }, { day: 'Antigo', period: 'Outro' }]
  assert.deepEqual(includeUsedInspectionSlots([], used), [{ day: 'Segunda', period: 'Noite' }])
})
const teams = [{ id: 't1', camp_id: 'a' }, { id: 't2', camp_id: 'a' }, { id: 't3', camp_id: 'b' }]
const rooms = [{ id: 'r1', camp_id: 'a', competition_team_id: 't1' }, { id: 'r2', camp_id: 'a', competition_team_id: 't2' }, { id: 'r3', camp_id: 'b', competition_team_id: 't3' }]
const selection = { campId: 'a', teamId: 't1', roomId: 'r1', day: 'Segunda', period: 'Manhã', schedule: [{ day: 'Segunda', period: 'Manhã' }], rooms, teams }
test('quartos sao filtrados por equipe e acampamento', () => {
  assert.deepEqual(getInspectionRoomOptions(rooms, teams, 'a', 't1'), [rooms[0]])
  assert.deepEqual(getInspectionRoomOptions(rooms, teams, 'a', 't3'), [])
})
test('inspecao permite apenas quarto da equipe e turno configurado', () => {
  assert.equal(validateInspectionSelection(selection), '')
  assert.ok(validateInspectionSelection({ ...selection, teamId: 't2' }))
  assert.ok(validateInspectionSelection({ ...selection, roomId: 'r3' }))
  assert.ok(validateInspectionSelection({ ...selection, period: 'Noite' }))
})
test('editar legado preserva turno original, mas nao autoriza copiar turno para outra inspecao', () => {
  const original = { tribe_id: 'r1', inspection_day: 'Antigo', inspection_period: 'Turno legado' }
  assert.equal(validateInspectionSelection({ ...selection, day: original.inspection_day, period: original.inspection_period, original }), '')
  assert.ok(validateInspectionSelection({ ...selection, day: original.inspection_day, period: original.inspection_period }))
  assert.ok(validateInspectionSelection({ ...selection, day: '', period: '', original: { tribe_id: 'r1' } }))
})
