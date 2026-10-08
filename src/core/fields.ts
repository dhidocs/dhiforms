import { evaluateCondition, visibleRows, type ItemScope } from './conditions'
import { fieldPath, ownValue } from './paths'
import type { Answers, Field, FormDefinition, Lookups, Page, Row } from './types'

export type RepeatedRow = Extract<Row, { type: 'repeated' }>

// One entry per field in the form, with the page it is on and the repeated row it belongs to (if any).
export type FormFieldEntry = { field: Field; page: Page; row: Row; repeated?: RepeatedRow }

export function formFields(definition: FormDefinition): FormFieldEntry[] {
  return definition.pages.flatMap((page) =>
    page.rows.flatMap((row): FormFieldEntry[] => {
      if (row.type === 'fields') return row.fields.map((field) => ({ field, page, row }))
      if (row.type === 'repeated') return row.fields.map((field) => ({ field, page, row, repeated: row }))
      return []
    }),
  )
}

export function repeatedRows(definition: FormDefinition): RepeatedRow[] {
  return definition.pages.flatMap((page) => page.rows.filter((row): row is RepeatedRow => row.type === 'repeated'))
}

// Items shown for a repeated row: fixed rows always show numRepeats items, add rows show what the answers hold.
export function repeatedItems(row: RepeatedRow, answers: Answers): Answers[] {
  const stored = ownValue(answers, row.key)
  const items: Answers[] = Array.isArray(stored) ? stored : []
  if (row.repeatType === 'add') return items
  return Array.from({ length: row.numRepeats ?? 1 }, (_, index) => items[index] ?? {})
}

export const itemScope = (row: RepeatedRow, index: number, values: Answers): ItemScope => ({ rowKey: row.key, index, values, fieldKeys: row.fields.map((field) => field.key) })

// A field that is on screen right now: its row and field conditions passed, with the repeated item it belongs to.
export type VisibleField = { field: Field; path: string; value: unknown; item?: ItemScope; rowKey?: string; index?: number }

export function visibleFields(page: Page, answers: Answers, lookups?: Lookups): VisibleField[] {
  return visibleRows(page, answers, lookups).flatMap((row): VisibleField[] => {
    if (row.type === 'fields') {
      return row.fields.filter((field) => evaluateCondition(field.showIf, { answers, lookups })).map((field) => ({ field, path: field.key, value: ownValue(answers, field.key) }))
    }
    if (row.type !== 'repeated') return []
    return repeatedItems(row, answers).flatMap((values, index) => {
      const item = itemScope(row, index, values)
      return row.fields
        .filter((field) => evaluateCondition(field.showIf, { answers, lookups, item }))
        .map((field) => ({ field, item, rowKey: row.key, index, path: fieldPath(field.key, row.key, index), value: ownValue(values, field.key) }))
    })
  })
}
