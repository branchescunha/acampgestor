export function countGraphemes(value = '', Segmenter = Intl.Segmenter) {
  if (Segmenter)
    return [
      ...new Segmenter('pt-BR', { granularity: 'grapheme' }).segment(value),
    ].length
  let count = 0
  let joined = false
  let regional = 0
  for (const char of value) {
    if (char === '\u200d') {
      joined = true
      continue
    }
    if (/\p{Mark}|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]/u.test(char))
      continue
    if (joined) {
      joined = false
      regional = 0
      continue
    }
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(char)) {
      if (regional++ % 2 === 0) count++
    } else {
      regional = 0
      count++
    }
  }
  return count
}

export function validateSymbol(value, original = '') {
  if (value === original) return ''
  return countGraphemes(value.trim()) > 3
    ? 'Use no máximo 3 caracteres visuais no símbolo.'
    : ''
}
