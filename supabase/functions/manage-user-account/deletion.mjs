const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const deletionActions = new Set([
  'preview-delete-self',
  'preview-delete-user',
  'delete-self',
  'delete-user',
])

export async function handleAccountDeletion({
  body,
  actor,
  identity,
  backend,
  reply,
  verifyPassword,
}) {
  const self = body.action.endsWith('self')
  const preview = body.action.startsWith('preview-')
  if (
    (self && actor.role !== 'gestor') ||
    (!self && (actor.role !== 'admin' || actor.status !== 'active'))
  )
    return reply(403, { message: 'Exclusão não autorizada para esta conta.' })
  const suppliedId = self ? identity.id : body.targetId
  if (typeof suppliedId !== 'string' || !uuid.test(suppliedId))
    return reply(400, { message: 'Selecione uma conta GESTOR válida.' })
  const targetId = suppliedId.toLowerCase()
  if (!preview && body.confirmation !== 'EXCLUIR CONTA')
    return reply(400, {
      message: 'Digite EXCLUIR CONTA para confirmar a remoção total.',
    })
  if (self && !preview) {
    if (
      typeof body.password !== 'string' ||
      !body.password ||
      body.password.length > 128
    )
      return reply(400, {
        message: 'Confirme sua senha atual para excluir a conta.',
      })
    // The callback creates an isolated Auth client; never reuse its session globally.
    const confirmedId = await verifyPassword(identity.email, body.password)
    if (confirmedId !== identity.id)
      return reply(403, {
        message: 'Não foi possível confirmar sua identidade.',
      })
  }
  const { data, error } = await backend.rpc(
    preview ? 'preview_account_deletion' : 'prepare_account_deletion',
    {
      p_actor_id: identity.id,
      p_target_id: targetId,
      ...(!preview
        ? { p_confirmation: body.confirmation, p_camp_ids: body.campIds || [] }
        : {}),
    }
  )
  if (error || !data)
    return reply(error?.code === '42501' ? 403 : 409, {
      message:
        'Não foi possível preparar a exclusão. Revise os vínculos e a prévia; nenhum sucesso foi confirmado.',
    })
  if (preview) return reply(200, data)
  if (data.state === 'completed')
    return reply(200, { success: true, state: 'completed' })
  if (data.state !== 'pending_auth' || data.target_id !== targetId)
    return reply(503, { message: 'Estado da exclusão não confirmado.' })
  try {
    await backend.auth.admin.deleteUser(targetId, false)
  } catch {
    // A timeout can happen after COMMIT. The durable SQL receipt decides success.
  }
  let completed = false
  try {
    const { data: state, error } = await backend.rpc(
      'account_deletion_status',
      {
        p_actor_id: identity.id,
        p_target_id: targetId,
      }
    )
    completed = !error && state === 'completed'
  } catch {
    // Never infer success from a missing receipt or an unavailable database.
  }
  if (!completed)
    return reply(409, {
      pending: true,
      message:
        'Dados exclusivos removidos e acesso suspenso, mas a remoção no Auth está pendente. Retome esta exclusão pela mesma conta ou solicite ao ADMIN. Não foi confirmado sucesso completo.',
    })
  // Auth DELETE + profile cascade + receipt completion share the Auth transaction.
  return reply(200, { success: true, state: 'completed' })
}
