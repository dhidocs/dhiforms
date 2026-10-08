import type { Field } from '../core'
import { Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { AnswerValue, ComputedValue } from './display'
import { FieldInput } from './FieldInput'
import classes from './forms.module.css'
import { LookupField } from './LookupField'
import type { FormContext } from './types'
import { useLocalize } from './useLocalize'

const ignore = () => undefined

// One field drawn as the wizard draws it, unanswered apart from prefill. The form designer's static preview shows these in place of its markup.
export function FieldPreview({ field, value, context }: { field: Field; value: unknown; context: FormContext }) {
  const l = useLocalize()
  if (field.type === 'computed') return <ComputedValue field={field} value={value} context={context} />
  if (field.type === 'lookup') return <LookupField field={field} path={field.key} answers={{}} context={context} value={value} live={false} onChange={ignore} />
  if (field.readOnly) {
    return (
      <div className={classes.locked}>
        <Text className={classes.lockedLabel}>{l(field.label)}</Text>
        <AnswerValue field={field} value={value} context={context} />
      </div>
    )
  }
  return <FieldInput field={field} value={value} context={context} onChange={ignore} />
}

// The renderer's row frame, so a host laying out its own grid still gets the renderer's per-language field styles.
export function FormRowFrame({ children }: { children: ReactNode }) {
  return <div className={classes.rowFrame}>{children}</div>
}
