export const ROOM_TYPES = ['Masculino', 'Feminino']

export function validateRoomType(type, originalType, editing = false) {
  if (ROOM_TYPES.includes(type)) return ''
  if (editing && (type || '') === (originalType || '')) return ''
  return 'Selecione Masculino ou Feminino para o tipo de quarto.'
}

export function getRoomColor(room, teams) {
  return teams.find(team => team.id === room?.competition_team_id && team.camp_id === room?.camp_id)?.color || room?.color || '#eab308'
}
