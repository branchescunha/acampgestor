export const MIN_PASSWORD_LENGTH = 6

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
