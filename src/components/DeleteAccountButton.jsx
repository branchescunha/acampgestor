import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useToast } from '../hooks/useToast'
import { invokeAccountAction } from '../features/auth/accountClient'
import { permanentDeletionEnabled } from '../features/auth/permanentDeletion'
import { supabase } from '../lib/supabase'

const labels = {
  competition_teams: 'equipes',
  tribes: 'quartos',
  participants: 'participantes',
  score_events: 'pontuações',
  gymkhana_events: 'gincanas',
  room_inspections: 'inspeções',
  gymkhana_settings: 'configurações',
  camp_operation_receipts: 'operações',
  camp_operation_audit: 'registros de histórico',
}

export default function DeleteAccountButton({
  targetId,
  targetName,
  self = false,
  disabled,
  onDeleted,
}) {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { showError, showSuccess } = useToast()
  const guard = useRef(false)
  const departed = useRef(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => departed.current?.(), [])
  if (!permanentDeletionEnabled) return null
  async function remove() {
    if (guard.current) return
    guard.current = true
    setBusy(true)
    let result
    try {
      const plan = await invokeAccountAction(supabase, {
        action: self ? 'preview-delete-self' : 'preview-delete-user',
        targetId,
      })
      if (plan.blockers?.length) {
        showError(plan.blockers.join(' '))
        return
      }
      result = await confirm({
        title: self
          ? 'Excluir minha conta definitivamente?'
          : `Excluir definitivamente ${targetName || 'esta conta GESTOR'}?`,
        description:
          'A remoção é irreversível. A conta e os acampamentos de sua propriedade exclusiva abaixo serão apagados. Vínculos compartilhados bloqueiam a operação. Se o Auth falhar, o acesso fica suspenso e a exclusão poderá ser retomada.',
        confirmationText: 'EXCLUIR CONTA',
        reauthenticate: self,
        confirmLabel: 'Excluir conta definitivamente',
        details: (
          <div className="mt-3 space-y-3 text-sm">
            <p className="break-all text-zinc-400">
              Conta selecionada: {targetId}
            </p>
            {(plan.camps || []).map((camp) => (
              <div key={camp.id}>
                <strong className="break-words">{camp.name}</strong>
                <p className="text-zinc-400">
                  {Object.entries(camp.counts || {})
                    .map(([key, count]) => `${count} ${labels[key] || key}`)
                    .join(', ')}
                </p>
              </div>
            ))}
            {!plan.camps?.length && (
              <p>Nenhum acampamento próprio será removido.</p>
            )}
            {plan.state === 'pending_auth' && (
              <p>
                A limpeza dos dados já terminou. Falta concluir a remoção no
                Auth.
              </p>
            )}
          </div>
        ),
      })
      if (!result) return
      const response = await invokeAccountAction(supabase, {
        action: self ? 'delete-self' : 'delete-user',
        targetId,
        confirmation: 'EXCLUIR CONTA',
        campIds: (plan.camps || []).map((camp) => camp.id),
        ...(self ? { password: result.password } : {}),
      })
      if (response.success !== true || response.state !== 'completed')
        throw new Error('Exclusão completa não confirmada.')
      if (self) {
        // Wait for lazy public navigation to unmount the protected route first.
        let leftRoute = false
        await new Promise(resolve => {
          const timeout = window.setTimeout(resolve, 5000)
          departed.current = () => { window.clearTimeout(timeout); leftRoute = true; resolve() }
          navigate('/', { replace: true })
        })
        await supabase.auth.signOut({ scope: 'local' })
        if (!leftRoute) window.location.replace('/')
      } else {
        showSuccess('Conta e dados exclusivos removidos definitivamente.')
        await onDeleted?.()
      }
    } catch (error) {
      showError(error.message)
    } finally {
      if (result && typeof result === 'object') result.password = ''
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={remove}
      className="record-action border-red-500/40 text-red-400 hover:bg-red-500/10"
    >
      <Trash2 size={16} aria-hidden="true" />
      {busy
        ? 'Verificando exclusão...'
        : self
          ? 'Excluir conta definitivamente'
          : 'Excluir gestor definitivamente'}
    </button>
  )
}
