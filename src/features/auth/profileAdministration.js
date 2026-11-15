export async function createManagedProfile(client, payload) {
  async function findById() {
    const { data, error } = await client
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('id', payload.id)
      .maybeSingle()

    if (error) throw error
    return data
  }

  const existing = await findById()
  if (existing) return { created: false, profile: existing }

  const { error } = await client.from('profiles').insert(payload)
  if (!error) return { created: true }

  if (error.code === '23505') {
    const concurrent = await findById()
    if (concurrent) return { created: false, profile: concurrent }
  }

  throw error
}
