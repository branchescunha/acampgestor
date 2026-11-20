export const MIN_PASSWORD_LENGTH = 6

const registrationMessages = {
  signup_disabled: 'O cadastro de novas contas está temporariamente desativado. Aguarde a liberação ou procure o suporte.',
  email_provider_disabled: 'O cadastro por e-mail está indisponível. Procure o suporte.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
  over_email_send_rate_limit: 'O limite de tentativas do serviço de e-mail foi atingido. Aguarde antes de tentar novamente.',
  weak_password: 'A senha não atende aos requisitos de segurança. Use uma senha mais longa e tente novamente.',
  unexpected_failure: 'Não foi possível preparar a conta com segurança. Procure o suporte antes de tentar novamente.',
  signup_confirmation_required: 'O serviço está exigindo confirmação de e-mail. O acesso imediato não foi liberado; procure o suporte antes de tentar novamente.',
  network_error: 'Não foi possível conectar ao serviço. Verifique sua conexão antes de tentar novamente.',
  service_unavailable: 'O serviço de cadastro está indisponível no momento. Tente novamente mais tarde; se persistir, procure o suporte.',
}
const genericRegistrationMessage = 'Não foi possível concluir o cadastro. Verifique os dados ou tente novamente mais tarde. Se já tem conta, entre ou procure o suporte.'

export function describeRegistrationError(error) {
  let code = 'auth_error'
  if (Object.hasOwn(registrationMessages, error?.code)) code = error.code
  else if (error?.status >= 500 && error.status < 600) code = 'service_unavailable'
  else if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) code = 'network_error'
  return {
    code,
    status: Number.isInteger(error?.status) ? error.status : null,
    message: registrationMessages[code] || genericRegistrationMessage,
  }
}

export function validateRegistration(form) {
  if (!form.name.trim()) return 'Informe seu nome.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return 'Informe um e-mail válido.'
  }
  if (!form.password.trim() || form.password.length < MIN_PASSWORD_LENGTH)
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (form.password !== form.confirmPassword) return 'As senhas não conferem.'
  return ''
}

export async function registerGestor(auth, form) {
  const validationError = validateRegistration(form)
  if (validationError) throw new Error(validationError)

  const { data, error } = await auth.signUp({
    email: form.email.trim().toLowerCase(),
    password: form.password,
    options: {
      data: { name: form.name.trim() },
    },
  })

  if (error) throw error

  if (!data?.session) {
    const confirmationError = new Error(
      'Cadastro imediato indisponível. Procure o suporte antes de tentar novamente.'
    )
    confirmationError.code = 'signup_confirmation_required'
    throw confirmationError
  }

  if (!data.user?.id || data.session.user?.id !== data.user.id) {
    throw new Error('Não foi possível validar a sessão do cadastro.')
  }

  return data.session
}
