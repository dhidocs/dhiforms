import type { Language, Text } from './types'

// The text in the chosen language; English when there is no translation (or the text is plain English).
export function localize(text: Text | undefined, language: Language = 'en'): string {
  if (text === undefined) return ''
  if (typeof text === 'string') return text
  return (language === 'dv' && text.dv) || text.en
}
