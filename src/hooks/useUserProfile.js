import { useEffect, useState } from 'react'
import { useAuthContext } from './useAuth'
import { useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

export function useUserProfile() {
  const { session, loadingAuth } = useAuthContext()
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [error, setError] = useState('')
  const loadFailed = useRef(false)

  useEffect(() => {
    let isMounted = true

    async function loadProfile() {
      setLoadingProfile(true)
      setError('')

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, role, status')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!isMounted) return

      if (profileError) {
        loadFailed.current = true
        logError('useUserProfile', profileError)
        setProfile(null)
        setError('Não foi possível carregar seu perfil de acesso.')
        setLoadingProfile(false)
        return
      }

      loadFailed.current = false
      setProfile(data || null)
      setLoadingProfile(false)
    }

    if (session?.user?.id) {
      loadProfile()
    }
    const retry = () => { if (session?.user?.id && loadFailed.current) void loadProfile() }
    window.addEventListener('acampgestor:retry-reads', retry)

    return () => {
      isMounted = false
      window.removeEventListener('acampgestor:retry-reads', retry)
    }
  }, [session])

  const role = profile?.role || ''
  const status = profile?.status || ''
  const isActive = status === 'active'
  const isAdmin = role === 'admin' && isActive
  const isGestor = role === 'gestor' && isActive

  return {
    profile,
    role,
    status,
    isAdmin,
    isGestor,
    isActive,
    loading: loadingAuth || Boolean(session?.user?.id && loadingProfile),
    error,
  }
}
