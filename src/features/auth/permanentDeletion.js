export const permanentDeletionEnabled =
  import.meta.env?.VITE_PERMANENT_DELETION_ENABLED === 'true'

export function canDeleteCamp(camp, profile) {
  return Boolean(
    camp?.id &&
    profile?.status === 'active' &&
    (profile.role === 'admin' ||
      (profile.role === 'gestor' && camp.created_by === profile.id))
  )
}

export async function deleteCamp(client, camp) {
  const { data, error } = await client.rpc('delete_camp_permanently', {
    p_camp_id: camp.id,
    p_confirmation: camp.name,
  })
  if (error || data?.deleted !== true) {
    throw new Error(
      error?.code === '23503'
        ? 'Há vínculos incompatíveis ou dados de outro acampamento. A exclusão foi cancelada integralmente; solicite revisão ao ADMIN.'
        : 'Não foi possível confirmar a exclusão. Atualize a listagem antes de tentar novamente.'
    )
  }
  return data
}
