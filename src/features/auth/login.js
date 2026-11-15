export function getLoginRedirectPath(from, role) {
  const valid =
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    ![...from].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  const path = valid ? from : ''

  if (role === 'admin') return /^\/admin(?:\/|$)/.test(path) ? path : '/admin'
  if (role === 'gestor') {
    return /^\/gestor(?:\/|$)/.test(path) ||
      /^\/[^/]+\/gestor(?:\/|$)/.test(path)
      ? path
      : '/gestor'
  }
  return '/gestor'
}
