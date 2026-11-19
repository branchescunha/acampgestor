import { useId } from 'react'
import { countGraphemes, validateSymbol } from '../utils/symbols'

export default function SymbolField({ value, original, onChange }) {
  const id = useId()
  const error = validateSymbol(value, original)
  return (
    <label className="min-w-0 text-sm text-zinc-400">
      <span className="sr-only">Símbolo</span>
      <input
        name="symbol"
        aria-label="Símbolo"
        value={value}
        onChange={onChange}
        aria-describedby={id}
        aria-invalid={Boolean(error)}
        placeholder="Símbolo"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-yellow-500"
      />
      <span
        id={id}
        className={`mt-1 block text-xs ${error ? 'text-red-400' : ''}`}
      >
        {error ||
          `${countGraphemes(value)} / 3 caracteres visuais${countGraphemes(value) > 3 ? ' (legado preservado)' : ''}`}
      </span>
    </label>
  )
}
