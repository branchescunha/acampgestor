import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import RoleAccessNotice from './RoleAccessNotice'
import Sidebar from './Sidebar'
import {
  getCampNameStorageKey,
  useActiveCamp,
} from '../hooks/useActiveCamp'
import { useUserProfile } from '../hooks/useUserProfile'

const adminOperationPaths = [
  '/admin/equipes',
  '/admin/quartos',
  '/admin/times',
  '/admin/participantes',
  '/admin/pontuacao',
  '/admin/historico',
  '/admin/exportacao',
  '/admin/gincana',
  '/admin/inspecoes',
]

export default function AdminLayout({ children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButton = useRef(null)
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false)
    menuButton.current?.focus()
  }, [])
  useEffect(() => {
    if (!isMenuOpen) return
    const sidebar = document.getElementById('camp-navigation')
    const content = document.getElementById('panel-content')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    content?.setAttribute('inert', '')
    sidebar?.querySelector('button, a')?.focus()
    function closeOnEscape(event) {
      if (event.key === 'Escape') closeMenu()
      if (event.key === 'Tab') {
        const targets = [...sidebar.querySelectorAll('a[href], button:not(:disabled), select')].filter(el => el.getClientRects().length)
        const first = targets[0]
        const last = targets.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); menuButton.current?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); menuButton.current?.focus() }
        else if (document.activeElement === menuButton.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onResize = () => { if (desktop.matches) closeMenu() }
    desktop.addEventListener('change', onResize)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      desktop.removeEventListener('change', onResize)
      content?.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
    }
  }, [isMenuOpen, closeMenu])
  const location = useLocation()
  const { campSlug } = useParams()
  const {
    profile,
    isAdmin,
    isGestor,
    isActive,
    loading: loadingProfile,
    error: profileError,
  } = useUserProfile()
  const { activeCampId } = useActiveCamp()
  const activeCampName = activeCampId
    ? window.localStorage.getItem(getCampNameStorageKey(activeCampId))
    : ''
  const isCampAdminRoute = Boolean(campSlug)
  const isAdminOperationRoute = adminOperationPaths.includes(location.pathname)
  const shouldShowActiveCampBar =
    isCampAdminRoute || isAdminOperationRoute
  const mobileTitle =
    isCampAdminRoute
      ? isGestor
        ? 'Painel do gestor'
        : 'Painel do acampamento'
      : isAdminOperationRoute
        ? 'Painel do acampamento'
        : 'Painel da plataforma'
  const roleLabel = isCampAdminRoute
    ? 'Acesso gestor'
    : isAdmin
      ? 'Administrador geral'
      : isGestor
        ? 'Gestor'
        : 'Perfil pendente'

  if (loadingProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">Verificando perfil de acesso...</p>
      </main>
    )
  }

  if (profileError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
        <RoleAccessNotice
          title="Perfil indisponível"
          message={profileError}
          actionPath=""
        />
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
        <RoleAccessNotice
          title="Perfil de acesso não encontrado"
          message="Seu usuário ainda não possui um perfil de acesso. Entre em contato com o administrador da plataforma."
          actionPath=""
        />
      </main>
    )
  }

  if (!isActive) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
        <RoleAccessNotice
          title="Acesso suspenso"
          message="Seu acesso está suspenso. Entre em contato com o administrador da plataforma."
          actionPath=""
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="flex">
        <Sidebar isMenuOpen={isMenuOpen} onClose={closeMenu} />

        <section id="panel-content" className="min-h-screen min-w-0 flex-1 p-5 lg:p-8">
          <header className="mb-8 flex items-center justify-between lg:hidden">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-yellow-500">
                {isCampAdminRoute ? 'Acampamento' : 'Plataforma'}
              </p>

              <h1 className="mt-2 text-xl font-bold">
                {mobileTitle}
              </h1>
            </div>

          </header>
          {document.getElementById('panel-menu-slot') && createPortal(<button
              type="button"
              ref={menuButton}
              onClick={() => isMenuOpen ? closeMenu() : setIsMenuOpen(true)}
              aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isMenuOpen}
              aria-controls="camp-navigation"
              className="theme-toggle"
            >
              {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>, document.getElementById('panel-menu-slot'))}

          {shouldShowActiveCampBar && (
          <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm text-zinc-300">
            {activeCampName ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {isCampAdminRoute
                    ? isGestor
                      ? 'Painel do gestor: '
                      : 'Painel do acampamento: '
                    : 'Acampamento ativo: '}
                  <strong className="text-white">{activeCampName}</strong>
                  <span className="ml-2 text-xs text-zinc-500">
                    {roleLabel}
                  </span>
                </span>
              </div>
            ) : (
              <span>
                Nenhum acampamento ativo selecionado.{' '}
                <Link
                  to="/admin/acampamentos"
                  className="font-semibold text-yellow-400 hover:text-yellow-300"
                >
                  Criar ou selecionar acampamento
                </Link>
              </span>
            )}
          </div>
          )}

          {children}
        </section>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}
    </main>
  )
}
