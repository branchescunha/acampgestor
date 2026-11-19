import { countGraphemes } from '../utils/symbols'

export default function EntitySymbol({ value, fallback = '', className = '' }) {
  return (
    <span
      className={`entity-symbol ${countGraphemes(value || fallback) > 3 ? 'entity-symbol-legacy' : ''} ${className}`}
      title={value || fallback}
    >
      {value || fallback}
    </span>
  )
}
