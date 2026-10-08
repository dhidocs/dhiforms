import { createContext, useContext, type ReactNode } from 'react'
import type { Language } from '../core'
import dv from '../labels/dv.json'
import { en } from '../labels/en'

// UI labels of the renderer and designer: English and Dhivehi defaults, overridable per key through DhiformsProvider.
// Lookup order: overrides in the language, defaults in the language, English overrides, English defaults.
// Substitution is {name} only: t('wizard.stepCount', { current: 1, total: 3 }).
export type LabelKey = keyof typeof en
export type LabelOverrides = Partial<Record<Language, Partial<Record<LabelKey, string>>>>

const defaults: Record<Language, Record<string, string>> = { en, dv }

// The provider sets these during render so t() also works outside components (designer model and store helpers).
let activeLanguage: Language = 'en'
let activeOverrides: LabelOverrides = {}

export function setLabelSource(language: Language, overrides: LabelOverrides) {
  activeLanguage = language
  activeOverrides = overrides
}

export function formatLabel(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

export function labelIn(language: Language, key: LabelKey, vars?: Record<string, string | number>) {
  const text = activeOverrides[language]?.[key] ?? defaults[language]?.[key] ?? activeOverrides.en?.[key] ?? en[key] ?? key
  return formatLabel(text, vars)
}

export const t = (key: LabelKey, vars?: Record<string, string | number>) => labelIn(activeLanguage, key, vars)

const LanguageScope = createContext<Language | null>(null)
export const UiLanguageContext = createContext<Language>('en')

// The UI language here: a LabelLanguageScope's language when inside one, else the provider's.
export function useLabelLanguage(): Language {
  const scoped = useContext(LanguageScope)
  const provided = useContext(UiLanguageContext)
  return scoped ?? provided
}

export function useT() {
  const language = useLabelLanguage()
  return (key: LabelKey, vars?: Record<string, string | number>) => labelIn(language, key, vars)
}

// Shows the labels below in another language, e.g. a form preview in Dhivehi inside an English designer.
export function LabelLanguageScope({ value, children }: { value: Language; children: ReactNode }) {
  return <LanguageScope.Provider value={value}>{children}</LanguageScope.Provider>
}
