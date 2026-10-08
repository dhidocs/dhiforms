import { implementedRules, listBusinessRules } from '../core'
import { Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormLanguage, FormWizard, useFormContext } from '../react'
import { useT } from '../react/labels'
import { isFieldsRow } from './model'
import { useDesigner, type CanvasView } from './store'
import classes from './designer.module.css'

// The renderer marks fields with data-field-id and text and repeated rows with data-row-id; a click selects that item on whichever page holds it.
function selectFromClick(target: EventTarget) {
  const element = (target as HTMLElement).closest<HTMLElement>('[data-field-id], [data-row-id]')
  if (!element) return
  const { fieldId, rowId } = element.dataset
  const { definition, page, setPage, select } = useDesigner.getState()
  definition.pages.some((candidate, pageIndex) =>
    candidate.rows.some((row, rowIndex) => {
      const fieldIndex = fieldId && isFieldsRow(row) ? row.fields.findIndex((field) => field.id === fieldId) : -1
      if (fieldIndex === -1 && !(rowId && row.id === rowId)) return false
      if (pageIndex !== page) setPage(pageIndex)
      select(fieldIndex === -1 ? { kind: 'row', row: rowIndex } : { kind: 'field', row: rowIndex, field: fieldIndex })
      return true
    }),
  )
}

// Outlines the selected field or row inside the rendered form, which has no designer markup of its own.
function SelectionOutline() {
  const selectedId = useDesigner((state) => {
    const row = state.definition.pages[state.page]?.rows[state.selection.kind === 'page' ? -1 : state.selection.row]
    if (!row) return null
    if (state.selection.kind === 'field') return isFieldsRow(row) ? row.fields[state.selection.field]?.id ?? null : null
    return row.id ?? null
  })
  if (!selectedId) return null
  const target = CSS.escape(selectedId)
  return <style>{`.${classes.preview} :is([data-field-id="${target}"], [data-row-id="${target}"]) { outline: 2px solid var(--df-primary); outline-offset: 6px; border-radius: 4px; }`}</style>
}

function LiveWizard() {
  const t = useT()
  const context = useFormContext()
  const definition = useDesigner((state) => state.definition)
  const current = useDesigner((state) => state.definition.pages[state.page])
  const previewAnswers = useDesigner((state) => state.previewAnswers)
  const setPreviewAnswers = useDesigner((state) => state.setPreviewAnswers)
  const setPage = useDesigner((state) => state.setPage)
  const requested = listBusinessRules(definition, implementedRules()).filter((listing) => !listing.implemented)
  const requestedText = requested.map((listing) => (listing.rule.description || listing.rule.id).trim().replace(/\.+$/, '')).join('; ')

  return (
    <>
      {requested.length > 0 && (
        <Text size="sm" c="dimmed" mb="md">
          {requested.length === 1 ? t('designer.previewRulesOne', { rules: requestedText }) : t('designer.previewRules', { count: requested.length, rules: requestedText })}
        </Text>
      )}
      {/* Remounts when the designer's page tab changes, so the wizard opens on that page with the answers given so far. */}
      <FormWizard
        key={current.id ?? current.key}
        definition={definition}
        answers={previewAnswers}
        context={context}
        initialPageKey={current.key}
        onChange={setPreviewAnswers}
        onPageChange={(key) => setPage(definition.pages.findIndex((page) => page.key === key))}
        onSubmit={() => { notifications.show({ color: 'green', message: t('designer.previewSubmitted') }) }}
        onSaveDraft={() => { notifications.show({ color: 'green', message: t('designer.previewSaved') }) }}
      />
    </>
  )
}

export function PreviewCanvas({ view }: { view: Extract<CanvasView, 'live' | 'json'> }) {
  const t = useT()
  const formLanguage = useDesigner((state) => state.formLanguage)
  const previewAnswers = useDesigner((state) => state.previewAnswers)

  if (view === 'json') {
    return (
      <div className={classes.canvasScroll}>
        <div className={classes.previewPaper}>
          {Object.keys(previewAnswers).length === 0 && <Text size="sm" c="dimmed" mb="sm">{t('designer.jsonEmpty')}</Text>}
          <pre className={classes.jsonBlock}>{JSON.stringify(previewAnswers, null, 2)}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className={`${classes.canvasScroll} ${classes.preview}`} data-view={view} onClickCapture={(event) => selectFromClick(event.target)}>
      <SelectionOutline />
      <FormLanguage language={formLanguage} withUiLabels className={classes.previewPaper}>
        <LiveWizard />
      </FormLanguage>
    </div>
  )
}
