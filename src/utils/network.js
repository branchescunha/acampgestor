export function connectionMessage(
  error = {},
  online = globalThis.navigator?.onLine !== false
) {
  if (!online)
    return 'Sem internet. Seus dados digitados foram mantidos. Reconecte e tente novamente.'
  if ([401, 403].includes(error.status) || error.code === '42501')
    return 'Sua sessão expirou ou não possui permissão para esta operação.'
  if (/fetch|network|timeout|tempo limite|abort/i.test(error.message || ''))
    return 'Não foi possível concluir a conexão. Confira a internet e tente novamente.'
  return 'O servidor não conseguiu concluir a solicitação. Tente novamente.'
}

export function createReadTimeoutFetch(
  fetchImpl = globalThis.fetch,
  timeout = 15000
) {
  return async (input, options = {}) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url
    )
    const method = (options.method || input.method || 'GET').toUpperCase()
    if (
      !url.pathname.startsWith('/rest/v1/') ||
      !['GET', 'HEAD'].includes(method)
    )
      return fetchImpl(input, options)
    const controller = new AbortController()
    const externalSignal = options.signal || input.signal
    const abort = () => controller.abort(externalSignal.reason)
    if (externalSignal?.aborted) abort()
    else externalSignal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(
      () => controller.abort(new Error('Tempo limite de leitura excedido')),
      timeout
    )
    function notify(error) {
      if (typeof window !== 'undefined')
        window.dispatchEvent(
          new CustomEvent('acampgestor:read-error', {
            detail: connectionMessage(error),
          })
        )
    }
    try {
      const response = await fetchImpl(input, {
        ...options,
        signal: controller.signal,
      })
      if (!response.ok) notify({ status: response.status })
      return response
    } catch (error) {
      if (!externalSignal?.aborted) notify(error)
      throw error
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abort)
    }
  }
}
