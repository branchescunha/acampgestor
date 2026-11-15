import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Script } from 'node:vm'

async function loadApprovalHandler() {
  const source = await readFile(
    new URL('../../../../supabase/functions/approve-access-request/index.ts', import.meta.url),
    'utf8',
  )
  // A retirada do cliente privilegiado impede efeitos antes da resposta de bloqueio.
  assert.doesNotMatch(source, /\bimport\b|Deno\.env|createClient/)
  let handler
  new Script(source).runInNewContext({
    Deno: { serve(callback) { handler = callback } },
    Response,
    Set,
  })
  assert.equal(typeof handler, 'function')
  return handler
}

test('legacy approval rejects every caller without reading credentials or creating users', async () => {
  const handler = await loadApprovalHandler()
  for (const authorization of ['', 'Bearer admin-session', 'Bearer suspended-session']) {
    const response = await handler(new Request('https://example.test/approve-access-request', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'legacy-request' }),
    }))
    assert.equal(response.status, 410)
    assert.deepEqual(await response.json(), {
      success: false,
      code: 'legacy_access_approval_disabled',
      message: 'A aprovação de solicitações foi desativada. Utilize /cadastro.',
    })
  }
})

test('legacy approval denies alternate HTTP methods and malformed payloads', async () => {
  const handler = await loadApprovalHandler()
  for (const method of ['GET', 'PUT', 'DELETE', 'POST']) {
    const response = await handler(new Request('https://example.test/approve-access-request', {
      method,
      ...(method === 'GET' ? {} : { body: '{invalid' }),
    }))
    assert.equal(response.status, 410)
  }
})

test('disabled approval preserves preflight only for the configured origins', async () => {
  const handler = await loadApprovalHandler()
  for (const origin of ['https://acampgestor.vercel.app', 'http://localhost:4000']) {
    const response = await handler(new Request('https://example.test/approve-access-request', {
      method: 'OPTIONS', headers: { origin },
    }))
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  }
  const response = await handler(new Request('https://example.test/approve-access-request', {
    method: 'OPTIONS', headers: { origin: 'https://untrusted.example' },
  }))
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
})
