import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  buildNewCampPayload,
  initialNewCampForm,
  validateNewCamp,
} from '../features/camps/campForm'
import { generateSlug } from '../utils/slug'
import { supabase } from '../lib/supabase'
import { logError } from '../utils/logger'

export default function CreateCampForm({ userId, onCreated, onCancel }) {
  const [form, setForm] = useState(initialNewCampForm)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    if (name === 'slug') setSlugTouched(true)
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'name' && !slugTouched ? { slug: generateSlug(value) } : {}),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const validationError = validateNewCamp(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    try {
      const { error: createError } = await supabase
        .from('camps')
        .insert(buildNewCampPayload(form, userId))
      if (createError) throw createError
      await onCreated()
    } catch (createError) {
      logError('CreateCampForm', createError)
      setError(
        createError.code === '23505'
          ? 'Essa URL já está em uso. Escolha outra URL para o acampamento.'
          : 'Não foi possível criar o acampamento. Tente novamente.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 border-t border-zinc-800 pt-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Novo acampamento</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="Cancelar criação"
          title="Cancelar criação"
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900"
        >
          <X size={20} />
        </button>
      </div>
      <fieldset
        disabled={saving}
        className="mt-5 grid min-w-0 gap-5 sm:grid-cols-2"
      >
        <div className="min-w-0">
          <label
            htmlFor="new-camp-name"
            className="block text-sm text-zinc-300"
          >
            Nome do acampamento
          </label>
          <input
            id="new-camp-name"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="new-camp-organization"
            className="block text-sm text-zinc-300"
          >
            Igreja ou organização
          </label>
          <input
            id="new-camp-organization"
            name="church_name"
            value={form.church_name}
            onChange={handleChange}
            required
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="new-camp-slug"
            className="block text-sm text-zinc-300"
          >
            URL do acampamento
          </label>
          <input
            id="new-camp-slug"
            name="slug"
            value={form.slug}
            onChange={handleChange}
            required
            autoCapitalize="none"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="new-camp-theme"
            className="block text-sm text-zinc-300"
          >
            Tema (opcional)
          </label>
          <input
            id="new-camp-theme"
            name="theme"
            value={form.theme}
            onChange={handleChange}
            className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="new-camp-start"
            className="block text-sm text-zinc-300"
          >
            Data de início (opcional)
          </label>
          <input
            id="new-camp-start"
            name="start_date"
            type="date"
            value={form.start_date}
            onChange={handleChange}
            className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="new-camp-end" className="block text-sm text-zinc-300">
            Data de fim (opcional)
          </label>
          <input
            id="new-camp-end"
            name="end_date"
            type="date"
            value={form.end_date}
            min={form.start_date || undefined}
            onChange={handleChange}
            className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-yellow-500"
          />
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 font-semibold text-zinc-950 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus size={18} />
        {saving ? 'Criando...' : 'Criar acampamento'}
      </button>
    </form>
  )
}
