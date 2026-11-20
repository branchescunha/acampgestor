import { buildV1QaScenario } from '../fixtures/acampGestorV1Scenario.js'

const id = (number) =>
  `80000000-0000-4000-8000-${String(number).padStart(12, '0')}`

export function createVisualFixture(role) {
  const scenario = buildV1QaScenario('QA-VISUAL')
  const user = {
    id: id(1),
    aud: 'authenticated',
    role: 'authenticated',
    email: 'fixture@example.invalid',
    app_metadata: { provider: 'email' },
    user_metadata: {},
  }
  const camp = {
    ...scenario.camps.jovens,
    id: id(11),
    name: 'Acampamento visual',
    slug: 'qa-unificado',
    created_by: user.id,
    inspection_schedule: [{ day: 'Segunda', period: 'Manhã' }],
  }
  const teams = scenario.competitionTeams.map((team, index) => ({
    ...team,
    id: id(21 + index),
    camp_id: camp.id,
  }))
  teams[0].name =
    'Equipe com um nome histórico muito extenso para conferir o alinhamento'
  teams[0].symbol = 'SIMBOLO HISTORICO MUITO LONGO'
  teams[1].symbol = '👨‍👩‍👧‍👦'
  teams[2].symbol = '🏕️🌿🏆'
  const rooms = scenario.tribes.slice(2).map((room, index) => ({
    ...room,
    id: id(31 + index),
    camp_id: camp.id,
    competition_team_id: teams[index].id,
    room_type: index ? 'Feminino' : 'Masculino',
    is_active: true,
    symbol: index ? '🌿' : 'HISTORICO LONGO',
  }))
  const participants = [
    {
      ...scenario.participants[2],
      id: id(41),
      camp_id: camp.id,
      competition_team_id: teams[0].id,
      tribe_id: rooms[0].id,
      full_name: 'Participante visual',
      birth_date: '2004-02-29',
      is_active: true,
      competition_teams: teams[0],
      tribes: rooms[0],
    },
  ]
  const totals = teams.map((team, index) => ({
    camp_id: camp.id,
    competition_team_id: team.id,
    positive_points: 100 - index * 20,
    penalty_points: 5,
    total: 95 - index * 20,
    participants_count: index ? 0 : 1,
  }))
  const scores = [
    {
      id: id(51),
      camp_id: camp.id,
      competition_team_id: teams[0].id,
      participant_id: null,
      points: 100,
      type: 'POINT',
      category: 'Outro',
      reason: 'Resultado visual',
      created_at: '2026-11-01T12:00:00Z',
      created_by: user.id,
      is_voided: false,
      competition_teams: teams[0],
    },
  ]
  const gym = [
    {
      id: id(61),
      camp_id: camp.id,
      title: 'Prova visual',
      awards: [{ competition_team_id: teams[0].id, points: 10 }],
      created_at: '2026-11-01T12:00:00Z',
      created_by: user.id,
    },
  ]
  const inspections = [
    {
      id: id(71),
      camp_id: camp.id,
      tribe_id: rooms[0].id,
      inspection_day: 'Segunda',
      inspection_period: 'Manhã',
      points: 5,
      type: 'POINT',
      tribes: rooms[0],
      created_at: '2026-11-01T12:00:00Z',
      created_by: user.id,
      deleted_at: null,
    },
  ]
  const profiles = [
    {
      id: user.id,
      name: 'Diretoria visual',
      role: role || 'gestor',
      status: 'active',
    },
    { id: id(2), name: 'Gestor visual', role: 'gestor', status: 'active' },
  ]
  const organizations = [
    {
      ...scenario.organizations.a,
      id: id(81),
      created_by: user.id,
      status: 'active',
    },
  ]
  return {
    user,
    camp,
    writes: [],
    authWrites: [],
    failReads: false,
    delay: 0,
    data: {
      profiles,
      camps: [camp],
      competition_teams: teams,
      tribes: rooms,
      participants,
      score_events: scores,
      gymkhana_events: gym,
      room_inspections: inspections,
      camp_score_totals: totals,
      public_camp_score_totals: totals,
      public_ranking_competition_teams: teams,
      public_ranking_competition_participants: participants,
      organizations,
      organization_members: [],
      gymkhana_settings: [],
      access_requests: [],
      invitations: [],
    },
  }
}

export async function createMockContext(
  browser,
  { role, width, baseURL, mobile = false }
) {
  const fixture = createVisualFixture(role)
  const context = await browser.newContext({
    viewport: { width, height: 960 },
    colorScheme: 'dark',
    locale: 'pt-BR',
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
  })
  await context.addInitScript(
    ({ user, camp, role }) => {
      localStorage.setItem('acampgestor:theme', 'dark')
      if (!role) return
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token =
        btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) +
        '.' +
        btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp })) +
        '.fixture'
      localStorage.setItem(
        'sb-visualqa-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          expires_at: exp,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        })
      )
      localStorage.setItem('acampgestor.activeCampId', camp.id)
      localStorage.setItem(`acampgestor.campName.${camp.id}`, camp.name)
      localStorage.setItem(`acampgestor.campSlug.${camp.id}`, camp.slug)
    },
    { user: fixture.user, camp: fixture.camp, role }
  )
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === baseURL && ['GET', 'HEAD'].includes(request.method()))
      return route.continue()
    if (url.hostname !== 'visualqa.supabase.co') return route.abort()
    if (fixture.delay)
      await new Promise((resolve) => setTimeout(resolve, fixture.delay))
    if (url.pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') {
        const payload = request.postDataJSON()
        fixture.authWrites.push({
          email: payload.email,
          passwordChanged: Boolean(payload.password),
        })
        if (payload.email) fixture.user.new_email = payload.email
      }
      return route.fulfill({ json: fixture.user })
    }
    if (url.pathname === '/functions/v1/manage-user-account') {
      const payload = request.postDataJSON()
      if (payload.action === 'capabilities')
        return route.fulfill({ json: { selfEmailEnabled: true } })
      if (['preview-delete-user', 'preview-delete-self', 'delete-user', 'delete-self'].includes(payload.action)) {
        const self = payload.action.endsWith('self')
        if ((!self && role !== 'admin') || (self && role !== 'gestor'))
          return route.fulfill({ status: 403, json: { message: 'Deletion forbidden' } })
        const target = self ? fixture.user.id : payload.targetId
        if (payload.action.startsWith('preview-'))
          return route.fulfill({ json: {
            target_id: target, state: fixture.deletionPending ? 'pending_auth' : 'preview',
            blockers: fixture.blockAccountDelete ? ['Resolva a organização compartilhada antes da exclusão.'] : [],
            camps: fixture.data.camps.filter(camp => camp.created_by === target).map(camp => ({ ...camp, counts: { participants: fixture.data.participants.length, score_events: fixture.data.score_events.length } })),
          } })
        if (payload.confirmation !== 'EXCLUIR CONTA' || (self && !payload.password))
          return route.fulfill({ status: 400, json: { message: 'Confirmation required' } })
        fixture.authWrites.push({ action: payload.action, targetId: target, passwordVerified: Boolean(payload.password) })
        if (fixture.failAuthDelete) {
          fixture.deletionPending = true
          return route.fulfill({ status: 409, json: { pending: true, message: 'Remoção no Auth pendente. Retome a exclusão pelo ADMIN.' } })
        }
        fixture.data.profiles = fixture.data.profiles.filter(profile => profile.id !== target)
        return route.fulfill({ json: { success: true, state: 'completed' } })
      }
      if (role !== 'admin')
        return route.fulfill({
          status: 403,
          json: { message: 'ADMIN required' },
        })
      if (payload.action === 'list-users')
        return route.fulfill({
          json: {
            users: [
              ...fixture.data.profiles.map((profile) => ({
                ...profile,
                email:
                  profile.id === fixture.user.id
                    ? fixture.user.email
                    : 'gestor@example.invalid',
              })),
              {
                id: id(3),
                name: null,
                email: 'pending@example.invalid',
                role: null,
                status: null,
                hasProfile: false,
              },
            ],
          },
        })
      fixture.authWrites.push({
        action: payload.action,
        targetId: payload.targetId,
        email: payload.email,
        passwordChanged: Boolean(payload.password),
      })
      return route.fulfill({ json: { success: true } })
    }
    const table = url.pathname.split('/').pop()
    if (table === 'delete_camp_permanently') {
      const payload = request.postDataJSON()
      const camp = fixture.data.camps.find(camp => camp.id === payload.p_camp_id)
      if (!camp || (role !== 'admin' && camp.created_by !== fixture.user.id))
        return route.fulfill({ status: 403, json: { code: '42501', message: 'Forbidden' } })
      if (payload.p_confirmation !== camp.name)
        return route.fulfill({ status: 400, json: { code: '22023', message: 'Confirmation required' } })
      fixture.writes.push({ table, method: 'POST', payload })
      for (const [key, rows] of Object.entries(fixture.data)) {
        if (Array.isArray(rows)) fixture.data[key] = rows.filter(row => key === 'camps' ? row.id !== camp.id : row.camp_id !== camp.id)
      }
      return route.fulfill({ json: { deleted: true, removed: {} } })
    }
    if (table === 'delete_empty_organization') {
      const payload = request.postDataJSON()
      if (role !== 'admin')
        return route.fulfill({
          status: 403,
          json: { code: '42501', message: 'ADMIN required' },
        })
      if (fixture.blockOrganizationDelete)
        return route.fulfill({
          status: 409,
          json: { code: '23503', message: 'Linked history' },
        })
      fixture.writes.push({ table, method: 'POST', payload })
      fixture.data.organizations = fixture.data.organizations.filter(
        (item) => item.id !== payload.target_organization_id
      )
      return route.fulfill({ status: 204 })
    }
    if (fixture.failReads && ['GET', 'HEAD'].includes(request.method())) {
      return route.fulfill({
        status: 503,
        json: { message: 'QA simulated read failure' },
      })
    }
    const matches = (item) =>
      [...url.searchParams].every(([key, value]) => {
        if (value.startsWith('eq.')) return String(item[key]) === value.slice(3)
        if (value === 'is.null') return item[key] == null
        return true
      })
    let data = (fixture.data[table] || []).filter(matches)
    if (!['GET', 'HEAD'].includes(request.method())) {
      const payload = request.postDataJSON()
      fixture.writes.push({
        table,
        method: request.method(),
        payload,
        query: url.search,
      })
      if (request.method() === 'PATCH')
        data.forEach((item) => Object.assign(item, payload))
      else if (request.method() === 'POST' && !table.startsWith('save_camp_')) {
        const item = { ...payload, id: id(90 + fixture.writes.length) }
        fixture.data[table] ||= []
        fixture.data[table].push(item)
        data = [item]
      }
      return route.fulfill({
        json: { id: data[0]?.id || payload?.p_record_id || id(99) },
      })
    }
    const single = (request.headers().accept || '').includes('vnd.pgrst.object')
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}`,
        'access-control-expose-headers': 'content-range',
      },
      body:
        request.method() === 'HEAD'
          ? ''
          : JSON.stringify(single ? data[0] || null : data),
    })
  })
  return { context, fixture }
}
