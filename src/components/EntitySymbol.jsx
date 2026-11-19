import { countGraphemes } from '../utils/symbols'

export default function EntitySymbol({ value, fallback = '', className = '' }) {
  const symbol = value || fallback
  const length = countGraphemes(symbol)
  const sizeClass = length > 3 ? 'entity-symbol-legacy' : length > 1 ? `entity-symbol-${length}` : ''
  return (
    <span
      className={`entity-symbol ${sizeClass} ${className}`}
      title={symbol}
    >
      {symbol}
    </span>
  )
}
