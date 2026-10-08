import { useDhiforms } from './config'
import type { FormContext } from './types'

// A FormContext with the provider's option lists, for screens without a stored submission (designer previews, a blank form). Pass what the host knows, such as lookups, documents and prefill.
export function useFormContext(partial: Partial<FormContext> = {}): FormContext {
  const { lists = {} } = useDhiforms()
  return { lists, lookups: {}, documents: [], prefill: {}, ready: true, ...partial }
}
