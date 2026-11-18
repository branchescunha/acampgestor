import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNewCampPayload, validateNewCamp } from '../campForm.js'

const camp = {
  name: 'Retiro de exemplo',
  church_name: 'Organização de exemplo',
  slug: 'retiro-de-exemplo',
  theme: '',
  start_date: '',
  end_date: '',
}

test('new camp requires a name, organization label, slug and valid date order', () => {
  assert.equal(validateNewCamp(camp), '')
  assert.ok(validateNewCamp({ ...camp, name: ' ' }))
  assert.ok(validateNewCamp({ ...camp, church_name: ' ' }))
  assert.ok(validateNewCamp({ ...camp, slug: '' }))
  assert.ok(validateNewCamp({ ...camp, slug: 'Invalid Slug' }))
  assert.ok(
    validateNewCamp({
      ...camp,
      start_date: '2026-12-15',
      end_date: '2026-12-14',
    })
  )
})

test('new camp cannot claim a fixed application route as its public slug', () => {
  for (const slug of [
    'admin',
    'cadastro',
    'gestor',
    'login',
    'forgot-password',
    'reset-password',
  ]) {
    assert.ok(validateNewCamp({ ...camp, slug }), slug)
  }
})

test('new camp remains independent and its owner comes only from the authenticated user', () => {
  const supplied = {
    ...camp,
    name: ' Retiro de exemplo ',
    created_by: 'someone-else',
    organization_id: 'third-party-org',
  }
  const payload = buildNewCampPayload(supplied, 'authenticated-user')
  assert.deepEqual(payload, {
    name: 'Retiro de exemplo',
    church_name: 'Organização de exemplo',
    slug: 'retiro-de-exemplo',
    theme: null,
    start_date: null,
    end_date: null,
    status: 'draft',
    public_ranking_enabled: true,
    organization_id: null,
    created_by: 'authenticated-user',
    inspection_schedule: [],
  })
  assert.equal(supplied.organization_id, 'third-party-org')
  assert.throws(() => buildNewCampPayload(camp, ''))
})

test('configuracao de inspecoes persiste no novo acampamento sem compartilhar arrays', () => {
  const slots = [{ day: 'Segunda', period: 'Noite' }, { day: 'Domingo', period: 'Tarde' }]
  const payload = buildNewCampPayload({ ...camp, inspection_schedule: slots }, 'authenticated-user')
  assert.deepEqual(payload.inspection_schedule, slots)
  assert.notEqual(payload.inspection_schedule, slots)
  assert.ok(validateNewCamp({ ...camp, inspection_schedule: [{ day: 'Segunda', period: 'Outro' }] }))
})
