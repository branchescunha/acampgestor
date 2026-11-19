import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { actorName } from '../utils/actors'

export function useActorNames(records, campId) {
  const [result, setResult] = useState({ key: '', profiles: [] })
  const ids = [
    ...new Set(records.map((record) => record.created_by).filter(Boolean)),
  ].sort()
  const key = JSON.stringify([campId, ids])
  useEffect(() => {
    let cancelled = false
    const [camp, authors] = JSON.parse(key)
    if (!camp || !authors.length) return
    async function load() {
      const profiles = []
      for (let index = 0; index < authors.length; index += 100) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', authors.slice(index, index + 100))
        if (cancelled) return
        if (!error) profiles.push(...(data || []))
      }
      if (!cancelled) setResult({ key, profiles })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [key])
  return (id) => actorName(id, result.key === key ? result.profiles : [])
}
