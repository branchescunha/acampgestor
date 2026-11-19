import { useEffect, useState } from 'react'

export default function ConnectionNotice() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState('')
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const onError = (event) => setError(event.detail)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('acampgestor:read-error', onError)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('acampgestor:read-error', onError)
    }
  }, [])
  if (online && !error) return null
  return (
    <aside role="status" className="connection-notice">
      <p>
        {!online
          ? 'Sem internet. Seus dados digitados serão mantidos. Nenhuma operação será reenviada automaticamente.'
          : error}
      </p>
      {online && (
        <button
          type="button"
          className="record-action mt-2"
          onClick={() => {
            setError('')
            window.dispatchEvent(new Event('acampgestor:retry-reads'))
          }}
        >
          Tentar novamente
        </button>
      )}
    </aside>
  )
}
