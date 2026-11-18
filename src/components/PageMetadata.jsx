import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getPageMetadata } from '../utils/pageMetadata'

export default function PageMetadata() {
  const { pathname } = useLocation()

  useEffect(() => {
    const metadata = getPageMetadata(pathname)
    document.title = metadata.title
    document.querySelector('meta[name="robots"]')?.setAttribute('content', metadata.robots)
    document.querySelector('meta[name="description"]')?.setAttribute('content', metadata.description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', metadata.title)
    let canonical = document.querySelector('link[rel="canonical"]')
    if (metadata.canonical) {
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.rel = 'canonical'
        document.head.append(canonical)
      }
      canonical.href = metadata.canonical
    } else {
      canonical?.remove()
    }
  }, [pathname])

  return null
}
