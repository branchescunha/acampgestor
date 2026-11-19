import { useEffect } from 'react'

export function useReadRetry(load) {
  useEffect(() => {
    const retry = () => {
      void load()
    }
    window.addEventListener('acampgestor:retry-reads', retry)
    return () => window.removeEventListener('acampgestor:retry-reads', retry)
  }, [load])
}
