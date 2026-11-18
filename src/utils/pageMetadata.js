export const SITE_URL = 'https://acampgestor.vercel.app'
export const SITE_DESCRIPTION = 'Organize acampamentos com equipes, quartos, participantes, pontos, gincanas, inspeções e ranking público. Exporte os dados em Excel.'

export function getPageMetadata(pathname) {
  const isHome = pathname === '/'
  const titles = {
    '/login': 'Entrar',
    '/cadastro': 'Cadastro de gestor',
    '/gestor': 'Meus Acampamentos',
    '/recuperar-senha': 'Recuperação de acesso',
    '/redefinir-senha': 'Redefinir senha',
  }
  const isPanel = /^\/admin(?:\/|$)|\/(?:gestor|admin)(?:\/|$)/.test(pathname)
  const title = isHome ? 'AcampGestor | Gestão de acampamentos' : `${titles[pathname] || (isPanel ? 'Painel de gestão' : 'Ranking público')} | AcampGestor`
  return {
    title,
    description: SITE_DESCRIPTION,
    robots: isHome ? 'index,follow' : 'noindex,nofollow',
    canonical: isHome ? `${SITE_URL}/` : null,
  }
}
