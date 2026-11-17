import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createResultOperation,
  isIntegerPoints,
  getGymkhanaAwards,
  validateGymkhanaAwards,
} from '../eventOperations.js'

const request = {
  campId: 'camp',
  kind: 'gymkhana',
  action: 'save',
  payload: {
    title: 'Prova',
    awards: [{ competition_team_id: 'team', points: 0 }],
  },
}

test('uses the atomic RPC contract and returns its result', async () => {
  let call
  const operation = createResultOperation({
    rpc: async (...args) => {
      call = args
      return { data: { id: 'result' }, error: null }
    },
  })
  assert.deepEqual(await operation.execute(request), { id: 'result' })
  assert.equal(call[0], 'save_camp_result')
  assert.deepEqual(call[1], {
    p_camp_id: 'camp',
    p_operation_id: call[1].p_operation_id,
    p_kind: 'gymkhana',
    p_action: 'save',
    p_record_id: null,
    p_payload: request.payload,
  })
  assert.match(
    call[1].p_operation_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  )
})

for (const mode of ['returned error', 'network rejection']) {
  test(`keeps the UUID after ${mode} and renews it after success`, async () => {
    const tokens = []
    let fail = true
    const error = new Error('network')
    const operation = createResultOperation({
      rpc: async (_name, args) => {
        tokens.push(args.p_operation_id)
        if (fail && mode === 'network rejection') throw error
        return fail ? { error } : { data: { id: 'result' }, error: null }
      },
    })
    await assert.rejects(operation.execute(request), error)
    fail = false
    await operation.execute(request)
    await operation.execute(request)
    assert.equal(tokens[0], tokens[1])
    assert.notEqual(tokens[1], tokens[2])
  })
}

test('renews UUID when payload, action, record, camp or kind changes', async () => {
  const tokens = []
  const operation = createResultOperation({
    rpc: async (_name, args) => {
      tokens.push(args.p_operation_id)
      return { error: new Error('network') }
    },
  })
  for (const change of [
    {},
    { payload: { ...request.payload, title: 'Outra' } },
    { action: 'delete' },
    { recordId: 'other' },
    { campId: 'other' },
    { kind: 'inspection' },
  ]) {
    await assert.rejects(operation.execute({ ...request, ...change }))
  }
  assert.equal(new Set(tokens).size, tokens.length)
})

test('fingerprints JSON objects independently of key order', async () => {
  const tokens = []
  const operation = createResultOperation({
    rpc: async (_name, args) => {
      tokens.push(args.p_operation_id)
      return { error: new Error('network') }
    },
  })
  await assert.rejects(operation.execute(request))
  await assert.rejects(
    operation.execute({
      ...request,
      payload: { awards: request.payload.awards, title: 'Prova' },
    })
  )
  assert.equal(tokens[0], tokens[1])
})

test('accepts signed integer points including zero, rejects empty and fractional values', () => {
  for (const value of [0, -5, 12, '0', '-5', '+12'])
    assert.equal(isIntegerPoints(value), true)
  for (const value of [
    '',
    '  ',
    null,
    undefined,
    true,
    [],
    1.5,
    '1.5',
    Infinity,
    NaN,
    2147483648,
    -2147483649,
  ])
    assert.equal(isIntegerPoints(value), false)
})

test('awards require a known team, integer points and no duplicate teams', () => {
  const teams = [{ id: 'a' }, { id: 'b' }]
  assert.equal(
    validateGymkhanaAwards(
      [
        { competition_team_id: 'a', points: 0 },
        { competition_team_id: 'b', points: -10 },
      ],
      teams
    ),
    null
  )
  for (const awards of [
    [],
    [{ competition_team_id: 'missing', points: 1 }],
    [{ competition_team_id: 'a', points: '' }],
    [{ competition_team_id: 'a', points: 1.5 }],
    [
      { competition_team_id: 'a', points: 1 },
      { competition_team_id: 'a', points: 2 },
    ],
  ])
    assert.ok(validateGymkhanaAwards(awards, teams))
})

test('reads new awards and legacy single winners without losing zero', () => {
  const awards = [
    { competition_team_id: 'a', points: -4 },
    { competition_team_id: 'b', points: 0 },
  ]
  assert.deepEqual(getGymkhanaAwards({ awards }), awards)
  assert.deepEqual(
    getGymkhanaAwards({
      awards: [],
      winning_competition_team_id: 'a',
      points_per_member: 0,
    }),
    [{ competition_team_id: 'a', points: 0 }]
  )
  assert.deepEqual(
    getGymkhanaAwards({ winning_team: 'A', points_per_member: 4 }),
    []
  )
  assert.deepEqual(
    getGymkhanaAwards({ winning_team: 'B', points_per_member: 4 }),
    []
  )
})

test('score uses save_camp_score without p_kind and retries the same UUID until success', async () => {
  const calls = []
  let fail = true
  const operation = createResultOperation({
    rpc: async (name, args) => {
      calls.push({ name, args })
      return fail
        ? { error: new Error('network') }
        : { data: { id: 'score' }, error: null }
    },
  })
  const score = {
    campId: 'camp',
    kind: 'score',
    action: 'save',
    recordId: 'existing',
    payload: { points: -10, type: 'PENALTY' },
  }
  await assert.rejects(operation.execute(score))
  fail = false
  assert.deepEqual(await operation.execute(score), { id: 'score' })
  await operation.execute(score)
  assert.equal(calls[0].name, 'save_camp_score')
  assert.deepEqual(calls[0].args, {
    p_camp_id: 'camp',
    p_action: 'save',
    p_record_id: 'existing',
    p_payload: score.payload,
    p_operation_id: calls[0].args.p_operation_id,
  })
  assert.equal(calls[0].args.p_operation_id, calls[1].args.p_operation_id)
  assert.notEqual(calls[1].args.p_operation_id, calls[2].args.p_operation_id)
})

test('switching between score and result RPC never reuses a failed token', async () => {
  const calls = []
  const operation = createResultOperation({
    rpc: async (name, args) => {
      calls.push({ name, args })
      return { error: new Error('network') }
    },
  })
  await assert.rejects(operation.execute({ ...request, kind: 'score' }))
  await assert.rejects(operation.execute(request))
  assert.equal(calls[0].name, 'save_camp_score')
  assert.equal(calls[1].name, 'save_camp_result')
  assert.equal(calls[1].args.p_kind, 'gymkhana')
  assert.notEqual(calls[0].args.p_operation_id, calls[1].args.p_operation_id)
})
