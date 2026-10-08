import { createContext, useContext, type ReactNode } from 'react'
import type { Language } from '../core'
import { LabelLanguageScope, useLabelLanguage } from './labels'

// Shows one form in a chosen language while the rest of the screen keeps the UI language (the designer's form-language switch).
const FormLanguageContext = createContext<Language | null>(null)

export function useFormLanguage() {
  const uiLanguage = useLabelLanguage()
  return useContext(FormLanguageContext) ?? uiLanguage
}

type FormLanguageProps = {
  language: Language
  // Also switch the renderer's own labels (buttons, step count, errors), as the person filling in the form would see them.
  withUiLabels?: boolean
  className?: string
  children: ReactNode
}

export function FormLanguage({ language, withUiLabels = false, className, children }: FormLanguageProps) {
  const content = (
    <FormLanguageContext.Provider value={language}>
      <div lang={language} dir={language === 'dv' ? 'rtl' : 'ltr'} className={className}>
        {children}
      </div>
    </FormLanguageContext.Provider>
  )
  return withUiLabels ? <LabelLanguageScope value={language}>{content}</LabelLanguageScope> : content
}
