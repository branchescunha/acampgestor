import { deletionActions, handleAccountDeletion } from './deletion.mjs'

const origins = new Set([
  'https://acampgestor.vercel.app',
  'http://localhost:4000',
  'http://127.0.0.1:5191',
])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validEmail = (value) =>
  typeof value === 'string' &&
  value.trim().length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export function createAccountHandler({
  auth,
  backend,
  selfEmailEnabled = false,
  deletionEnabled = false,
  verifyPassword = async () => null,
}) {
  return async (request) => {
    const origin = request.headers.get('Origin') || ''
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    }
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers })
    if (origin && !origins.has(origin))
      return reply(403, { message: 'Origem não autorizada.' })
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers })
    if (request.method !== 'POST')
      return reply(405, { message: 'Método não permitido.' })
    const authorization = request.headers.get('Authorization') || ''
    if (!/^Bearer\s+\S+$/i.test(authorization))
      return reply(401, { message: 'Sessão necessária.' })
    try {
      const { data: identity, error: identityError } = await auth.auth.getUser(
        authorization.replace(/^Bearer\s+/i, '')
      )
      if (identityError || !identity?.user?.id)
        return reply(401, { message: 'Sessão inválida.' })
      const { data: actor, error: actorError } = await backend
        .from('profiles')
        .select('id, role, status')
        .eq('id', identity.user.id)
        .maybeSingle()
      if (
        actorError ||
        !actor ||
        !['active', 'suspended'].includes(actor.status) ||
        !['admin', 'gestor'].includes(actor.role)
      )
        return reply(403, { message: 'Acesso ativo necessário.' })
      const raw = await request.text()
      if (raw.length > 4096)
        return reply(413, { message: 'Solicitação muito grande.' })
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return reply(400, { message: 'Solicitação inválida.' })
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return reply(400, { message: 'Solicitação inválida.' })
      if (deletionActions.has(body.action)) {
        if (!deletionEnabled) return reply(503, { message: 'Exclusão definitiva ainda não ativada no backend.' })
        const { data: deletionReady, error: deletionError } = await backend.rpc('permanent_deletion_ready')
        if (deletionError || deletionReady !== true) return reply(503, { message: 'Migration de exclusão ainda não instalada ou verificada.' })
        return await handleAccountDeletion({ body, actor, identity: identity.user, backend, reply, verifyPassword })
      }
      if (actor.status !== 'active')
        return reply(403, { message: 'Acesso ativo necessário.' })
      const { data: ready, error: readinessError } = await backend.rpc(
        'account_management_ready'
      )
      if (readinessError || ready !== true)
        return reply(503, {
          message: 'Backend de contas ainda não instalado ou verificado.',
        })
      if (body.action === 'capabilities')
        return reply(200, {
          selfEmailEnabled: actor.role === 'gestor' && selfEmailEnabled,
        })
      if (actor.role !== 'admin')
        return reply(403, { message: 'Acesso exclusivo do ADMIN ativo.' })
      if (body.action === 'list-users') {
        const users = []
        const profilesById = new Map()
        for (let offset = 0; ; offset += 100) {
          const { data: profiles, error } = await backend
            .from('profiles')
            .select('id, name, role, status')
            .order('id')
            .range(offset, offset + 99)
          if (error)
            return reply(503, {
              message: 'Não foi possível consultar as contas.',
            })
          for (const profile of profiles || [])
            profilesById.set(profile.id, profile)
          if (!profiles || profiles.length < 100) break
        }
        for (let page = 1; ; page++) {
          const { data, error } = await backend.auth.admin.listUsers({
            page,
            perPage: 100,
          })
          if (error || !Array.isArray(data?.users))
            return reply(503, {
              message: 'Não foi possível consultar o inventário Auth.',
            })
          for (const user of data.users) {
            const profile = profilesById.get(user.id)
            users.push({
              id: user.id,
              name: profile?.name || null,
              role: profile?.role || null,
              status: profile?.status || null,
              email: user.email || null,
              hasProfile: Boolean(profile),
              authMissing: false,
            })
            profilesById.delete(user.id)
          }
          if (data.users.length < 100) break
        }
        for (const profile of profilesById.values())
          users.push({
            ...profile,
            email: null,
            hasProfile: true,
            authMissing: true,
          })
        return reply(200, { users })
      }
      if (!['reset-password', 'update-email'].includes(body.action))
        return reply(400, { message: 'Ação inválida.' })
      if (
        typeof body.targetId !== 'string' ||
        !uuid.test(body.targetId) ||
        body.confirmed !== true
      )
        return reply(400, {
          message: 'Confirme a alteração da conta selecionada.',
        })
      const { data: target, error: targetError } = await backend
        .from('profiles')
        .select('id, role, status')
        .eq('id', body.targetId)
        .maybeSingle()
      if (targetError || !target || target.role !== 'gestor')
        return reply(403, {
          message: 'Esta operação permite apenas contas GESTOR existentes.',
        })
      const { data: authTarget, error: authTargetError } =
        await backend.auth.admin.getUserById(target.id)
      if (authTargetError || authTarget?.user?.id !== target.id)
        return reply(409, {
          message:
            'Identidade Auth inconsistente. Nenhuma alteração realizada.',
        })
      let attributes
      if (body.action === 'reset-password') {
        if (
          typeof body.password !== 'string' ||
          !body.password.trim() ||
          body.password.length < 6 ||
          body.password.length > 128
        )
          return reply(400, {
            message: 'A senha deve ter entre 6 e 128 caracteres.',
          })
        attributes = { password: body.password }
      } else {
        if (!validEmail(body.email))
          return reply(400, { message: 'Informe um e-mail válido.' })
        // Explicit ADMIN correction by UID, not an identity or membership lookup by email.
        attributes = {
          email: body.email.trim().toLowerCase(),
          email_confirm: true,
        }
      }
      const { data: currentActor, error: recheckError } = await backend
        .from('profiles')
        .select('id, role, status')
        .eq('id', actor.id)
        .maybeSingle()
      if (
        recheckError ||
        currentActor?.role !== 'admin' ||
        currentActor?.status !== 'active'
      )
        return reply(403, {
          message: 'Autorização administrativa indisponível.',
        })
      attributes.app_metadata = {
        acampgestor_admin_operation: {
          actor_id: actor.id,
          target_id: target.id,
          action: body.action,
          request_id: crypto.randomUUID(),
          expires_at: Math.floor(Date.now() / 1000) + 60,
        },
      }
      const { error } = await backend.auth.admin.updateUserById(
        target.id,
        attributes
      )
      // Never return SDK errors, password, token, full Auth user or raw metadata.
      if (error)
        return reply(409, {
          message:
            'Não foi possível alterar o acesso. Verifique conflito de e-mail ou restrições da conta.',
        })
      return reply(200, {
        success: true,
        message:
          body.action === 'reset-password'
            ? 'Senha anterior substituída. O status do acesso foi preservado.'
            : 'E-mail de acesso atualizado. O status do acesso foi preservado.',
      })
    } catch {
      return reply(503, {
        message:
          'Não foi possível concluir a operação. Nenhuma credencial será exibida.',
      })
    }
  }
}
