import { useEffect, useState } from 'react'
import { useAuthContext } from './useAuth'
import { useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

export function useUserProfile() {
  const { session, loadingAuth } = useAuthContext()
  const userId = session?.user?.id
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [error, setError] = useState('')
  const loadFailed = useRef(false)
  const previousUser = useRef(null)

  useEffect(() => {
    let isMounted = true

    async function loadProfile(background = false) {
      if (!background) setLoadingProfile(true)
      setError('')

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, role, status')
        .eq('id', userId)
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

    if (userId) {
      void loadProfile(previousUser.current === userId)
    }
    previousUser.current = userId
    const retry = () => {
      if (userId && loadFailed.current) void loadProfile()
    }
    window.addEventListener('acampgestor:retry-reads', retry)
    const reload = () => {
      if (userId) void loadProfile(true)
    }
    window.addEventListener('acampgestor:profile-updated', reload)

    return () => {
      isMounted = false
      window.removeEventListener('acampgestor:retry-reads', retry)
      window.removeEventListener('acampgestor:profile-updated', reload)
    }
  }, [userId, session])

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
