export async function invokeAccountAction(client, body) {
  const { data, error } = await client.functions.invoke('manage-user-account', {
    body,
  })
  if (error) {
    let message = 'Não foi possível concluir a operação administrativa.'
    try {
      const response = await error.context?.json()
      if (typeof response?.message === 'string') message = response.message
    } catch {
      /* A proxy may return a non-JSON failure. */
    }
    throw new Error(message)
  }
  if (!data || typeof data !== 'object')
    throw new Error('Resposta administrativa inválida.')
  return data
}
