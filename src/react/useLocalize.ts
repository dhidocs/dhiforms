import { localize, type Text } from '../core'
import { useFormLanguage } from './FormLanguage'

// Definition text (labels, help, options, messages) in the form's language (the UI language unless a FormLanguage sets one); English when there is no translation.
export function useLocalize() {
  const language = useFormLanguage()
  return (text: Text | undefined) => localize(text, language)
}
