import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useConfirm } from '../hooks/useConfirm'
import { formSnapshot, hasUnsavedForms } from '../utils/navigation'

export default function RefreshButton() {
  const baselines = useRef(new Map())
  const bypass = useRef(false)
  const guard = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    const forms = baselines.current
    function remember(event) {
      const form = event.target.form
      if (form && !forms.has(form)) forms.set(form, formSnapshot(form))
    }
    function beforeUnload(event) {
      if (!bypass.current && hasUnsavedForms(forms)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const clear = () => forms.clear()
    const saved = (event) => {
      if (event.target.tagName === 'FORM')
        forms.set(event.target, formSnapshot(event.target))
    }
    const unknownInput = (event) => {
      const form = event.target.form
      if (form && !forms.has(form)) forms.set(form, '')
    }
    // Capture the baseline before typing, pasting, autofill or changing a select.
    const events = ['focusin', 'beforeinput', 'pointerdown', 'keydown']
    for (const name of events) document.addEventListener(name, remember, true)
    document.addEventListener('input', unknownInput, true)
    document.addEventListener('acampgestor:form-saved', saved, true)
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('acampgestor:route-changed', clear)
    return () => {
      for (const name of events)
        document.removeEventListener(name, remember, true)
      document.removeEventListener('input', unknownInput, true)
      document.removeEventListener('acampgestor:form-saved', saved, true)
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('acampgestor:route-changed', clear)
    }
  }, [])

  async function refresh() {
    if (guard.current) return
    guard.current = true
    try {
      if (
        hasUnsavedForms(baselines.current) &&
        !(await confirm({
          title: 'Descartar alterações e atualizar?',
          description:
            'Existem alterações no formulário. Atualizar a página descartará o que ainda não foi salvo.',
          confirmLabel: 'Descartar e atualizar',
        }))
      )
        return
      bypass.current = true
      setRefreshing(true)
      window.location.reload()
    } finally {
      guard.current = false
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        aria-busy={refreshing}
        aria-label={refreshing ? 'Atualizando página' : 'Atualizar página'}
        title="Atualizar página"
        className="theme-toggle"
      >
        <RefreshCw
          size={19}
          aria-hidden="true"
          className={refreshing ? 'animate-spin' : ''}
        />
      </button>
      <span role="status" className="sr-only">
        {refreshing ? 'Atualizando os dados da página...' : ''}
      </span>
    </>
  )
}
