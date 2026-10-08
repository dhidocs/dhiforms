import type { Text } from '../core'
import { Textarea, TextInput } from '@mantine/core'
import type { ReactNode } from 'react'
import { useT } from '../react/labels'
import classes from './designer.module.css'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={classes.propSection}>
      <h3 className={classes.propHeading}>{title}</h3>
      {children}
    </section>
  )
}

export const optionalNumber = (next: string | number) => (next === '' ? undefined : Number(next))

export const englishOf = (text: Text | undefined) => (typeof text === 'string' ? text : (text?.en ?? ''))
export const dhivehiOf = (text: Text | undefined) => (typeof text === 'string' ? '' : (text?.dv ?? ''))

// Stores plain English until a Dhivehi translation is typed, so untranslated definitions keep their simple shape.
export const withTranslation = (en: string, dv: string): Text => (dv ? { en, dv } : en)

type TextPropertyProps = { label: string; description?: string; placeholder?: string; value: Text | undefined; onChange: (next: Text) => void; multiline?: boolean; minRows?: number }

// A text property with its Dhivehi translation right under it (right to left).
export function TextProperty({ label, description, placeholder, value, onChange, multiline, minRows }: TextPropertyProps) {
  const t = useT()
  const en = englishOf(value)
  const dv = dhivehiOf(value)
  const Input = multiline ? Textarea : TextInput
  const sizing = multiline ? { autosize: true, minRows } : {}
  return (
    <div className={classes.textProperty}>
      <Input label={label} description={description} placeholder={placeholder} {...sizing} value={en} onChange={(event) => onChange(withTranslation(event.currentTarget.value, dv))} />
      <Input label={t('designer.inDhivehi', { label })} dir="rtl" lang="dv" {...sizing} value={dv} onChange={(event) => onChange(withTranslation(en, event.currentTarget.value))} />
    </div>
  )
}
