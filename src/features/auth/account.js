import { MIN_PASSWORD_LENGTH } from './registration.js'

export function accountEmail(authUser) {
  return authUser?.email || ''
}

export function validateAccountName(name) {
  return !name?.trim() || name.trim().length > 200
    ? 'Informe um nome de até 200 caracteres.'
    : ''
}

export function validateAccountEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim() || '') &&
    email.trim().length <= 254
    ? ''
    : 'Informe um e-mail válido.'
}

export function validateAccountPassword(password, confirmation) {
  if (!password?.trim() || password.length < MIN_PASSWORD_LENGTH)
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (password.length > 128) return 'A senha deve ter no máximo 128 caracteres.'
  return password === confirmation ? '' : 'As senhas não conferem.'
}

// Enable only after migration 020 and the Edge Function have been installed and verified.
export const accountManagementEnabled =
  import.meta.env?.VITE_ACCOUNT_MANAGEMENT_ENABLED === 'true'
