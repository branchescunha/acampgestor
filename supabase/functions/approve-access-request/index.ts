const allowedOrigins = new Set([
  'https://acampgestor.vercel.app',
  'https://acamp-gestor.vercel.app',
  'http://localhost:4000',
])

Deno.serve((request) => {
  const origin = request.headers.get('Origin')?.trim() || ''
  const headers = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  return new Response(JSON.stringify({
    success: false,
    code: 'legacy_access_approval_disabled',
    message: 'A aprovação de solicitações foi desativada. Utilize /cadastro.',
  }), {
    status: 410,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
})
