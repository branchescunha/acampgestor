import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useRecordAction } from '../hooks/useRecordAction'
import {
  canDeleteCamp,
  deleteCamp,
  permanentDeletionEnabled,
} from '../features/auth/permanentDeletion'
import { supabase } from '../lib/supabase'

export default function DeleteCampButton({
  camp,
  profile,
  disabled,
  onDeleted,
}) {
  const { run, busy } = useRecordAction()
  const [error, setError] = useState('')
  if (!permanentDeletionEnabled || !canDeleteCamp(camp, profile)) return null
  async function remove() {
    setError('')
    const done = await run(
      {
        title: `Excluir definitivamente ${camp.name}?`,
        description:
          'Esta ação é irreversível. Equipes, quartos, participantes, pontos, gincanas, inspeções e todo o histórico exclusivo deste acampamento serão apagados. Contas e organizações serão preservadas. O ranking público deixará de existir.',
        confirmationText: camp.name,
        confirmLabel: 'Excluir definitivamente',
      },
      async () => {
        try {
          await deleteCamp(supabase, camp)
        } catch (operationError) {
          setError(operationError.message)
          throw operationError
        }
      },
      'Acampamento excluído definitivamente.'
    )
    if (done) await onDeleted(camp)
  }
  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={disabled || busy}
        className="record-action border-red-500/40 text-red-400 hover:bg-red-500/10"
      >
        <Trash2 size={16} aria-hidden="true" />
        {busy ? 'Excluindo...' : 'Excluir definitivamente'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </>
  )
}
