import { assignIds, newId, type Answers, type Field, type FieldType, type FormDefinition, type Page, type Row, type RowType, type Text } from '../core'
import type { Language as LabelLanguage } from '../core'
import { create } from 'zustand'
import { t } from '../react/labels'
import { isFieldsRow, newDefinition, newField, newRow, type Selection } from './model'

// One store holds the working definition because the palette, canvas, property panel and top bar all read and change it.
// Every change goes through edit(), which keeps a snapshot for undo.
type DesignerState = {
  definition: FormDefinition
  page: number
  selection: Selection
  past: FormDefinition[]
  // The latest published version before this one; business rules reworded since then get a new id, and publishing compares against it.
  baseline: FormDefinition | null
  setBaseline: (baseline: FormDefinition | null) => void
  load: (definition: FormDefinition) => void
  edit: (change: (draft: FormDefinition) => void) => void
  undo: () => void
  setPage: (page: number) => void
  select: (selection: Selection) => void
  // The language the canvas and preview show the form in; the designer's own screens stay in the UI language.
  formLanguage: LabelLanguage
  setFormLanguage: (language: LabelLanguage) => void
  // Design shows the editing markup; the static preview shows every row as respondents see it; the live preview runs the wizard; json shows the live answers.
  canvasView: CanvasView
  setCanvasView: (view: CanvasView) => void
  previewAnswers: Answers
  setPreviewAnswers: (answers: Answers) => void
}

export type CanvasView = 'design' | 'static' | 'live' | 'json'

export const useDesigner = create<DesignerState>((set, get) => ({
  definition: newDefinition('form', 'Form'),
  page: 0,
  selection: { kind: 'page' },
  past: [],
  baseline: null,
  setBaseline: (baseline) => set({ baseline }),
  formLanguage: 'en',
  setFormLanguage: (formLanguage) => set({ formLanguage }),
  canvasView: 'design',
  setCanvasView: (canvasView) => set({ canvasView }),
  previewAnswers: {},
  setPreviewAnswers: (previewAnswers) => set({ previewAnswers }),
  load: (definition) => set({ definition, page: 0, selection: { kind: 'page' }, past: [], previewAnswers: {} }),
  edit: (change) => {
    const { definition, past } = get()
    const draft = structuredClone(definition)
    change(draft)
    set({ definition: draft, past: [...past.slice(-49), definition] })
  },
  undo: () => {
    const { past, page } = get()
    if (past.length === 0) return
    const definition = past[past.length - 1]
    set({ definition, past: past.slice(0, -1), page: Math.min(page, definition.pages.length - 1), selection: { kind: 'page' } })
  },
  setPage: (page) => set({ page, selection: { kind: 'page' } }),
  select: (selection) => set({ selection }),
}))

const designer = () => useDesigner.getState()

export function addPage() {
  const { definition } = designer()
  let number = definition.pages.length + 1
  while (definition.pages.some((page) => page.key === `page${number}`)) number++
  designer().edit((draft) => {
    draft.pages.push({ id: newId('p'), key: `page${number}`, title: t('designer.pageNumber', { number: definition.pages.length + 1 }), rows: [{ id: newId('r'), type: 'fields', fields: [] }] })
  })
  designer().setPage(definition.pages.length)
}

export function updatePage(index: number, patch: Partial<Page>) {
  designer().edit((draft) => Object.assign(draft.pages[index], patch))
}

export function movePage(from: number, to: number) {
  designer().edit((draft) => {
    const [moved] = draft.pages.splice(from, 1)
    draft.pages.splice(to, 0, moved)
  })
  designer().setPage(to)
}

export function deletePage(index: number) {
  designer().edit((draft) => draft.pages.splice(index, 1))
  designer().setPage(Math.max(0, Math.min(index, designer().definition.pages.length - 1)))
}

export function updateRow(row: number, patch: Record<string, unknown>) {
  const { page } = designer()
  designer().edit((draft) => Object.assign(draft.pages[page].rows[row], patch))
}

export function updateField(row: number, field: number, patch: Partial<Field>) {
  const { page } = designer()
  designer().edit((draft) => {
    const target = draft.pages[page].rows[row]
    if (isFieldsRow(target)) Object.assign(target.fields[field], patch)
  })
}

// Replaces the whole field, so keys cleared with undefined are really removed from the JSON.
export function replaceField(row: number, field: number, next: Field) {
  const { page } = designer()
  designer().edit((draft) => {
    const target = draft.pages[page].rows[row]
    if (isFieldsRow(target)) target.fields[field] = next
  })
}

export function insertRow(index: number, row: Row) {
  const { page } = designer()
  designer().edit((draft) => draft.pages[page].rows.splice(index, 0, row))
  designer().select({ kind: 'row', row: index })
}

export function addRowOfType(type: RowType, index?: number) {
  const { definition, page, selection } = designer()
  const rows = definition.pages[page].rows
  const at = index ?? (selection.kind === 'page' ? rows.length : selection.row + 1)
  insertRow(at, newRow(definition, type))
}

export function moveRow(from: number, to: number) {
  const { page } = designer()
  designer().edit((draft) => {
    const [moved] = draft.pages[page].rows.splice(from, 1)
    draft.pages[page].rows.splice(to, 0, moved)
  })
  designer().select({ kind: 'row', row: to })
}

export function deleteRow(index: number) {
  const { page } = designer()
  designer().edit((draft) => draft.pages[page].rows.splice(index, 1))
  designer().select({ kind: 'page' })
}

// Adds a new field to a row, or into a new fields row when the target is not a fields or repeated row.
export function insertField(type: FieldType, rowIndex: number | null, fieldIndex?: number) {
  const { definition, page } = designer()
  const rows = definition.pages[page].rows
  const field = newField(definition, type)

  if (rowIndex !== null && isFieldsRow(rows[rowIndex])) {
    const row = rows[rowIndex] as Extract<Row, { fields: Field[] }>
    const at = fieldIndex ?? row.fields.length
    designer().edit((draft) => (draft.pages[page].rows[rowIndex] as any).fields.splice(at, 0, field))
    designer().select({ kind: 'field', row: rowIndex, field: at })
    return
  }

  insertFieldInNewRow(type, rowIndex === null ? rows.length : rowIndex + 1)
}

// A field dropped between two rows gets a new fields row of its own at that position.
export function insertFieldInNewRow(type: FieldType, at: number) {
  const { definition, page } = designer()
  const field = newField(definition, type)
  designer().edit((draft) => draft.pages[page].rows.splice(at, 0, { id: newId('r'), type: 'fields', fields: [field] }))
  designer().select({ kind: 'field', row: at, field: 0 })
}

export function moveField(fromRow: number, fromField: number, toRow: number, toField: number) {
  const { page } = designer()
  designer().edit((draft) => {
    const rows: any[] = draft.pages[page].rows
    const [moved] = rows[fromRow].fields.splice(fromField, 1)
    rows[toRow].fields.splice(toField, 0, moved)
  })
  designer().select({ kind: 'field', row: toRow, field: toField })
}

export function deleteField(rowIndex: number, fieldIndex: number) {
  const { page } = designer()
  designer().edit((draft) => (draft.pages[page].rows[rowIndex] as any).fields.splice(fieldIndex, 1))
  designer().select({ kind: 'row', row: rowIndex })
}

// Takes a field out of its row and puts it alone in a new fields row at the given index.
export function moveFieldToNewRow(fromRow: number, fromField: number, toRowIndex: number) {
  const { page } = designer()
  designer().edit((draft) => {
    const rows: any[] = draft.pages[page].rows
    const [moved] = rows[fromRow].fields.splice(fromField, 1)
    rows.splice(toRowIndex, 0, { id: newId('r'), type: 'fields', fields: [moved] })
  })
  designer().select({ kind: 'field', row: toRowIndex, field: 0 })
}

// Keyboard alternative to dragging a field to the row above or below: it joins that fields row, or gets a row of its own there.
export function shiftFieldToRow(rowIndex: number, fieldIndex: number, direction: -1 | 1) {
  const { definition, page } = designer()
  const rows = definition.pages[page].rows
  const neighbour = rowIndex + direction
  const sourceEmpties = rows[rowIndex].type === 'fields' && (rows[rowIndex] as any).fields.length === 1
  if (neighbour >= 0 && neighbour < rows.length && isFieldsRow(rows[neighbour])) {
    const at = direction === -1 ? (rows[neighbour] as any).fields.length : 0
    designer().edit((draft) => {
      const draftRows: any[] = draft.pages[page].rows
      const [moved] = draftRows[rowIndex].fields.splice(fieldIndex, 1)
      draftRows[neighbour].fields.splice(at, 0, moved)
      if (sourceEmpties) draftRows.splice(rowIndex, 1)
    })
    designer().select({ kind: 'field', row: sourceEmpties && direction === 1 ? neighbour - 1 : neighbour, field: at })
    return
  }
  if (sourceEmpties) {
    if (neighbour < 0 || neighbour >= rows.length) return
    moveRow(rowIndex, neighbour)
    designer().select({ kind: 'field', row: neighbour, field: 0 })
    return
  }
  moveFieldToNewRow(rowIndex, fieldIndex, direction === -1 ? rowIndex : rowIndex + 1)
}

export function updateDefinitionTitle(title: Text) {
  designer().edit((draft) => {
    draft.title = title
  })
}

export function replaceDefinition(next: FormDefinition) {
  const withIds = assignIds(next)
  designer().edit((draft) => {
    draft.title = withIds.title
    draft.pages = withIds.pages
  })
  designer().setPage(0)
}
