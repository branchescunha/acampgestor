import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { resetRouteScroll } from '../utils/navigation'

export default function RouteNavigation() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])
  useLayoutEffect(() => {
    window.dispatchEvent(new Event('acampgestor:route-changed'))
    resetRouteScroll(window, document)
    const frame = requestAnimationFrame(() => {
      resetRouteScroll(window, document)
      document.getElementById('main-content')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])
  return null
}
