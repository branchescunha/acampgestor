import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthContext } from '../hooks/useAuth'
import {
  registerGestor,
  MIN_PASSWORD_LENGTH,
  validateRegistration,
  describeRegistrationError,
} from '../features/auth/registration'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

const initialForm = { name: '', email: '', password: '', confirmPassword: '' }

export default function Register() {
  const { session, loadingAuth } = useAuthContext()
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const submitting = useRef(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    const validationError = validateRegistration(form)
    if (validationError) {
      setError(validationError)
      return
    }

    submitting.current = true
    setLoading(true)
    try {
      await registerGestor(supabase.auth, form)
      setForm(initialForm)
      setSuccess(true)
    } catch (registrationError) {
      const diagnostic = describeRegistrationError(registrationError)
      logError('Register', { code: diagnostic.code, status: diagnostic.status })
      setError(diagnostic.message)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  if (loadingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Verificando sessão...
      </main>
    )
  }
  if (session && !loading && !error) return <Navigate to="/login" replace />

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-yellow-500">
          AcampGestor
        </p>
        <h1 className="mt-4 text-3xl font-bold">Criar conta de gestor</h1>
        {success ? (
          <p role="status" className="mt-6 text-zinc-300">
            Conta criada. Entre para acessar seus acampamentos.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="registration-name"
                className="block text-sm text-zinc-300"
              >
                Nome do responsável ou diretoria
              </label>
              <input
                id="registration-name"
                name="name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required
                disabled={loading}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label
                htmlFor="registration-email"
                className="block text-sm text-zinc-300"
              >
                E-mail
              </label>
              <input
                id="registration-email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
                disabled={loading}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
              />
            </div>
            <div>
              <label
                htmlFor="registration-password"
                className="block text-sm text-zinc-300"
              >
                Senha
              </label>
              <input
                id="registration-password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                disabled={loading}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Pelo menos {MIN_PASSWORD_LENGTH} caracteres.
              </p>
            </div>
            <div>
              <label
                htmlFor="registration-confirm-password"
                className="block text-sm text-zinc-300"
              >
                Confirmar senha
              </label>
              <input
                id="registration-confirm-password"
                name="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                disabled={loading}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-yellow-500"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-yellow-500 px-4 py-3 font-semibold text-zinc-950 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>
        )}
        <Link
          to="/login"
          className="mt-6 block text-center text-sm text-zinc-300 hover:text-yellow-500"
        >
          Já tenho conta. Entrar
        </Link>
        <Link
          to="/"
          className="mt-3 block text-center text-sm text-zinc-400 hover:text-yellow-500"
        >
          Voltar para o início
        </Link>
      </section>
    </main>
  )
}
