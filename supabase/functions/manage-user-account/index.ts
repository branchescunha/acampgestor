import { createClient } from 'npm:@supabase/supabase-js@2.108.2'
import { createAccountHandler } from './handler.mjs'

const url = Deno.env.get('SUPABASE_URL')?.trim()
const anon = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
if (!url || !anon || !service)
  throw new Error('Configuração de backend indisponível.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
Deno.serve(
  createAccountHandler({
    auth: createClient(url, anon, options),
    backend: createClient(url, service, options),
    // Enable only after verifying SMTP and secure email-change delivery.
    selfEmailEnabled: Deno.env.get('ACCOUNT_SELF_EMAIL_ENABLED') === 'true',
    deletionEnabled: Deno.env.get('ACCOUNT_DELETION_ENABLED') === 'true',
    verifyPassword: async (email: string, password: string) => {
      const client = createClient(url, anon, options)
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (data.session) await client.auth.signOut({ scope: 'local' })
      return error ? null : data.user?.id
    },
  })
)
