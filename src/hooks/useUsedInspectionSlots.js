import { useEffect, useState } from 'react'
import { readAllPages } from '../features/scores/scoreTotals'
import { supabase } from '../lib/supabase'

export function useUsedInspectionSlots(campId) {
  const [state, setState] = useState({ campId: null, slots: [], error: '' })
  useEffect(() => {
    let ignore = false
    async function load() {
      if (!campId) return
      const { data, error } = await readAllPages(() => supabase.from('room_inspections')
        .select('id, inspection_day, inspection_period').eq('camp_id', campId).order('id'))
      if (!ignore) setState({ campId, slots: (data || []).map(row => ({ day: row.inspection_day, period: row.inspection_period })), error: error ? 'Não foi possível conferir os turnos já utilizados. Reabra a edição para tentar novamente.' : '' })
    }
    void load()
    return () => { ignore = true }
  }, [campId])
  return {
    usedSlots: state.campId === campId ? state.slots : [],
    loading: Boolean(campId && state.campId !== campId),
    error: state.campId === campId ? state.error : '',
  }
}
