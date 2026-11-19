export function actorName(id, profiles = []) {
  return (
    profiles.find((profile) => profile.id === id)?.name?.trim() ||
    'Conta não identificada'
  )
}
