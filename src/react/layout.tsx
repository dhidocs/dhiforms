import type { Field, Row } from '../core'
import { Divider, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import classes from './forms.module.css'
import { useLocalize } from './useLocalize'

// Fields with a width take that many of 12 columns; the rest share what is left equally. Narrow rows stack (see .cell).
export function columnSpan(field: Field, siblings: Field[]) {
  if (field.width) return Math.min(12, field.width)
  const fixed = siblings.reduce((sum, sibling) => sum + (sibling.width ?? 0), 0)
  const flexible = siblings.filter((sibling) => !sibling.width).length
  const remaining = 12 - fixed
  return remaining > 0 ? Math.max(1, Math.floor(remaining / flexible)) : Math.floor(12 / siblings.length)
}

export function FieldGrid({ fields, children }: { fields: Field[]; children: (field: Field) => ReactNode }) {
  return (
    <div className={classes.rowFrame}>
      <div className={classes.grid}>
        {fields.map((field) => (
          <div key={field.key} className={classes.cell} style={{ '--span': columnSpan(field, fields) } as any} data-field-id={field.id}>
            {children(field)}
          </div>
        ))}
      </div>
    </div>
  )
}

// heading, subheading, paragraph and break rows look the same in the wizard and the read-only view; `quiet` shrinks them for read-only pages.
// data-row-id and data-field-id let the form designer map a click in its previews back to the row or field.
export function TextRow({ row, quiet }: { row: Row; quiet?: boolean }) {
  const l = useLocalize()
  if (row.type === 'break') return <Divider className={classes.break} data-row-id={row.id} />
  if (row.type === 'heading') return <Text component="h3" className={quiet ? classes.headingQuiet : classes.heading} data-row-id={row.id}>{l(row.text)}</Text>
  if (row.type === 'subheading') return <Text component="h4" className={quiet ? classes.subheadingQuiet : classes.subheading} data-row-id={row.id}>{l(row.text)}</Text>
  if (row.type === 'paragraph') return <Text className={quiet ? classes.paragraphQuiet : classes.paragraph} data-row-id={row.id}>{l(row.text)}</Text>
  return null
}
