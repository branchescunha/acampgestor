export const INSPECTION_DAYS = [
  { value: 'Segunda', label: 'Segunda-feira' },
  { value: 'Terça', label: 'Terça-feira' },
  { value: 'Quarta', label: 'Quarta-feira' },
  { value: 'Quinta', label: 'Quinta-feira' },
  { value: 'Sexta', label: 'Sexta-feira' },
  { value: 'Sábado', label: 'Sábado' },
  { value: 'Domingo', label: 'Domingo' },
]
export const INSPECTION_PERIODS = ['Manhã', 'Tarde', 'Noite']
export const ALL_INSPECTION_SLOTS = INSPECTION_DAYS.flatMap(({ value }) => INSPECTION_PERIODS.map(period => ({ day: value, period })))
export const LEGACY_INSPECTION_SLOTS = [
  { day: 'Sexta', period: 'Noite' },
  ...INSPECTION_PERIODS.map(period => ({ day: 'Sábado', period })),
  { day: 'Domingo', period: 'Manhã' },
  { day: 'Domingo', period: 'Tarde' },
]
const slotKey = slot => `${slot.day}/${slot.period}`
export function isValidInspectionSchedule(value) {
  return Array.isArray(value) && value.length <= 21 && value.every(slot =>
    slot && Object.keys(slot).length === 2 && INSPECTION_DAYS.some(day => day.value === slot.day) && INSPECTION_PERIODS.includes(slot.period)
  ) && new Set(value.map(slotKey)).size === value.length
}
export function getInspectionSchedule(value) {
  const source = value == null ? LEGACY_INSPECTION_SLOTS : isValidInspectionSchedule(value) ? value : []
  return source.map(slot => ({ ...slot }))
}
export function toggleInspectionSlot(schedule, day, period) {
  const selected = new Set(schedule.map(slotKey))
  const key = slotKey({ day, period })
  if (selected.has(key)) selected.delete(key)
  else selected.add(key)
  return ALL_INSPECTION_SLOTS.filter(slot => selected.has(slotKey(slot))).map(slot => ({ ...slot }))
}
export function includeUsedInspectionSlots(schedule, usedSlots) {
  const selected = new Set([...schedule, ...usedSlots].map(slotKey))
  return ALL_INSPECTION_SLOTS.filter(slot => selected.has(slotKey(slot))).map(slot => ({ ...slot }))
}
export function getInspectionRoomOptions(rooms, teams, campId, teamId) {
  if (!campId || !teamId || !teams.some(team => team.id === teamId && team.camp_id === campId)) return []
  return rooms.filter(room => room.camp_id === campId && room.competition_team_id === teamId)
}
export function validateInspectionSelection({ campId, teamId, roomId, day, period, schedule, rooms, teams, original }) {
  if (!getInspectionRoomOptions(rooms, teams, campId, teamId).some(room => room.id === roomId)) return 'Selecione uma equipe e um quarto vinculado a ela neste acampamento.'
  if (!day || !period) return 'Selecione o dia e o turno da inspeção.'
  if (schedule.some(slot => slot.day === day && slot.period === period)) return ''
  if (original?.tribe_id === roomId && original.inspection_day === day && original.inspection_period === period) return ''
  return 'Selecione um turno configurado para este acampamento.'
}
