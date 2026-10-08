import type { Answers, Field, Row } from '../core'
import { SortableContext, horizontalListSortingStrategy, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, SegmentedControl, Text } from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconGitBranch, IconGripVertical, IconPlus, IconScale, IconTrash } from '@tabler/icons-react'
import { applyPrefill, isRuleImplemented, localize, ownValue, type Text as FormText } from '../core'
import { createContext, useContext, type ReactNode } from 'react'
import { FieldPreview, FormLanguage, FormRowFrame, TextRow, useFormContext, type FormContext } from '../react'
import { useT } from '../react/labels'
import { columnSpan, describeCondition, describeFormula, fieldTypeInfo, rowTypeInfo } from './model'
import { PreviewCanvas } from './PreviewViews'
import { addPage, deleteRow, moveRow, useDesigner, type CanvasView } from './store'
import classes from './designer.module.css'

function ShownWhen({ condition, ownKey }: { condition: any; ownKey?: string }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  if (!condition) return null
  const text = t('designer.shownWhen', { condition: describeCondition(condition, definition, ownKey) })
  return (
    <span className={classes.shownWhen} title={text}>
      <IconGitBranch size={12} />
      <span className={classes.shownWhenText}>{text}</span>
    </span>
  )
}

// Requested rules still need a developer; implemented ones already run in the form.
function RuleBadge({ field }: { field: Field }) {
  const t = useT()
  const formKey = useDesigner((state) => state.definition.key)
  const rules = field.businessRules ?? []
  if (rules.length === 0) return null
  const requested = rules.filter((rule) => !isRuleImplemented(formKey, rule.id)).length
  const implementedText = rules.length === 1 ? t('designer.rulesImplementedOne') : t('designer.rulesImplemented', { count: rules.length })
  const text = requested === 0 ? implementedText : requested === 1 ? t('designer.rulesRequestedOne') : t('designer.rulesRequested', { count: requested })
  return (
    <span className={classes.chipBadge} data-requested={requested > 0} title={rules.map((rule) => rule.description).join('\n')}>
      <IconScale size={12} />
      {text}
    </span>
  )
}

// Form text in the designer's form language; the designer's own labels stay in the UI language.
function useFormText() {
  const language = useDesigner((state) => state.formLanguage)
  return (text: FormText | undefined) => localize(text, language)
}

function useFormLang() {
  return useDesigner((state) => state.formLanguage)
}

// Set in the static preview: rows and fields draw as the filled-in form instead of the design markup, keeping drag and drop and selection.
const CleanPreview = createContext<{ context: FormContext; answers: Answers } | null>(null)

function dragStyle(transform: any, transition: string | undefined) {
  return { transform: CSS.Transform.toString(transform), transition }
}

function FieldChip({ field, siblings, rowIndex, fieldIndex, readOnly }: { field: Field; siblings: Field[]; rowIndex: number; fieldIndex: number; readOnly: boolean }) {
  const t = useT()
  const l = useFormText()
  const lang = useFormLang()
  const clean = useContext(CleanPreview)
  const selection = useDesigner((state) => state.selection)
  const select = useDesigner((state) => state.select)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `field:${rowIndex}:${fieldIndex}`, disabled: readOnly })
  const Icon = fieldTypeInfo[field.type].icon
  const isSelected = selection.kind === 'field' && selection.row === rowIndex && selection.field === fieldIndex

  return (
    <div
      ref={setNodeRef}
      className={classes.chip}
      data-selected={isSelected}
      data-dragging={isDragging}
      data-over={isOver && !isDragging}
      style={{ ...dragStyle(transform, transition), '--span': columnSpan(field, siblings) } as any}
      {...attributes}
      {...listeners}
      onClick={(event) => {
        event.stopPropagation()
        select({ kind: 'field', row: rowIndex, field: fieldIndex })
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') select({ kind: 'field', row: rowIndex, field: fieldIndex })
        listeners?.onKeyDown?.(event as any)
      }}
      aria-label={`${l(field.label) || t('designer.untitledField')}, ${fieldTypeInfo[field.type].label}`}
    >
      {clean ? (
        <FieldPreview field={field} value={ownValue(clean.answers, field.key)} context={clean.context} />
      ) : (
        <>
          <span className={classes.chipLabel} lang={lang}>
            {l(field.label) || t('designer.untitledField')}
            {field.required && <span className={classes.required} aria-label={t('designer.requiredAria')}> *</span>}
          </span>
          <span className={classes.chipControl}>
            <Icon size={14} stroke={1.6} />
            <span className={classes.chipControlText}>{field.type === 'computed' ? describeFormula(field.formula) || t('designer.noFormulaYet') : l(field.placeholder) || fieldTypeInfo[field.type].label}</span>
          </span>
          <span className={classes.chipKey}>{field.key}</span>
          <ShownWhen condition={field.showIf} />
          <RuleBadge field={field} />
        </>
      )}
    </div>
  )
}

function FieldsGrid({ row, rowIndex, readOnly }: { row: Extract<Row, { fields: Field[] }>; rowIndex: number; readOnly: boolean }) {
  const t = useT()
  const clean = useContext(CleanPreview)
  const ids = row.fields.map((_, fieldIndex) => `field:${rowIndex}:${fieldIndex}`)

  if (row.fields.length === 0) {
    return <div className={classes.emptyRow}>{t('designer.emptyRow')}</div>
  }

  const grid = (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div className={classes.chipGrid}>
        {row.fields.map((field, fieldIndex) => (
          <FieldChip key={ids[fieldIndex]} field={field} siblings={row.fields} rowIndex={rowIndex} fieldIndex={fieldIndex} readOnly={readOnly} />
        ))}
      </div>
    </SortableContext>
  )
  // The renderer's row frame brings its per-language field styles (Dhivehi question size, no fake bold).
  return clean ? <FormRowFrame>{grid}</FormRowFrame> : grid
}

function repeatSummary(row: Extract<Row, { type: 'repeated' }>, t: ReturnType<typeof useT>) {
  const fixedCount = row.numRepeats ?? 1
  if (row.repeatType === 'fixed') return fixedCount === 1 ? t('designer.repeatFixedOne') : t('designer.repeatFixed', { count: fixedCount })
  const atLeast = row.minRepeats ? t('designer.repeatAtLeast', { count: row.minRepeats }) : null
  const upTo = row.maxRepeats ? t('designer.repeatUpTo', { count: row.maxRepeats }) : t('designer.repeatAnyNumber')
  return [atLeast, upTo].filter(Boolean).join(' ')
}

function RowBody({ row, rowIndex, readOnly }: { row: Row; rowIndex: number; readOnly: boolean }) {
  const t = useT()
  const l = useFormText()
  const lang = useFormLang()
  const clean = useContext(CleanPreview)
  if (row.type === 'fields') return <FieldsGrid row={row} rowIndex={rowIndex} readOnly={readOnly} />
  if (clean && row.type === 'repeated') {
    return (
      <div className={classes.cleanRepeated}>
        {row.label && <Text fw={600}>{l(row.label)}</Text>}
        <div className={classes.cleanItem}>
          <Text fw={500}>{l(row.itemLabel) || t('wizard.item')} 1</Text>
          <FieldsGrid row={row} rowIndex={rowIndex} readOnly={readOnly} />
        </div>
      </div>
    )
  }
  if (clean && (row.type === 'break' || (row.type !== 'repeated' && l(row.text)))) return <TextRow row={row} />
  if (row.type === 'break') return <hr className={classes.previewBreak} />
  if (row.type !== 'repeated') {
    const textClass = { heading: classes.previewHeading, subheading: classes.previewSubheading, paragraph: classes.previewParagraph }[row.type]
    return <Text component="div" className={textClass} lang={row.text ? lang : undefined}>{l(row.text) || t('designer.emptyTextRow', { type: rowTypeInfo[row.type].label.toLowerCase() })}</Text>
  }
  return (
    <div className={classes.repeatedFrame}>
      <div className={classes.repeatedTitle}>
        <span lang={lang}>{l(row.label) || row.key}</span>
        <span className={classes.repeatedSummary}>{repeatSummary(row, t)}</span>
      </div>
      <FieldsGrid row={row} rowIndex={rowIndex} readOnly={readOnly} />
    </div>
  )
}

function RowBlock({ row, rowIndex, rowCount, readOnly }: { row: Row; rowIndex: number; rowCount: number; readOnly: boolean }) {
  const selection = useDesigner((state) => state.selection)
  const select = useDesigner((state) => state.select)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `row:${rowIndex}`, disabled: readOnly })
  const isSelected = selection.kind === 'row' && selection.row === rowIndex
  const Icon = rowTypeInfo[row.type].icon
  const t = useT()
  const name = rowTypeInfo[row.type].label.toLowerCase()

  return (
    <div
      ref={setNodeRef}
      className={classes.row}
      data-selected={isSelected}
      data-dragging={isDragging}
      data-over={isOver && !isDragging}
      style={dragStyle(transform, transition)}
      onClick={() => select({ kind: 'row', row: rowIndex })}
    >
      {!readOnly && <RowGap index={rowIndex} />}
      <div className={classes.rowHeader}>
        {!readOnly && (
          <button type="button" ref={setActivatorNodeRef} className={classes.handle} aria-label={t('designer.dragRow', { name })} {...attributes} {...listeners} onClick={(event) => event.stopPropagation()}>
            <IconGripVertical size={16} />
          </button>
        )}
        <Icon size={14} stroke={1.6} className={classes.rowIcon} />
        <span className={classes.rowLabel}>{rowTypeInfo[row.type].label}</span>
        <ShownWhen condition={row.showIf} />
        {!readOnly && (
          <div className={classes.rowMoves}>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('designer.moveRowUp', { name })} disabled={rowIndex === 0} onClick={(event) => { event.stopPropagation(); moveRow(rowIndex, rowIndex - 1) }}>
              <IconArrowUp size={15} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('designer.moveRowDown', { name })} disabled={rowIndex === rowCount - 1} onClick={(event) => { event.stopPropagation(); moveRow(rowIndex, rowIndex + 1) }}>
              <IconArrowDown size={15} />
            </ActionIcon>
          </div>
        )}
        {!readOnly && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            className={classes.rowDelete}
            aria-label={t('designer.deleteRowNamed', { name })}
            onClick={(event) => {
              event.stopPropagation()
              deleteRow(rowIndex)
            }}
          >
            <IconTrash size={15} />
          </ActionIcon>
        )}
      </div>
      <RowBody row={row} rowIndex={rowIndex} readOnly={readOnly} />
    </div>
  )
}

// The space above a row: dropping a new field here puts it in a new fields row between the two rows.
function RowGap({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${index}` })
  return <div ref={setNodeRef} className={classes.rowGap} data-over={isOver} aria-hidden />
}

function EndZone() {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: 'end' })
  return (
    <div ref={setNodeRef} className={classes.endZone} data-over={isOver}>
      {t('designer.endZone')}
    </div>
  )
}

function PageTab({ index, title, active, readOnly }: { index: number; title: string; active: boolean; readOnly: boolean }) {
  const t = useT()
  const lang = useFormLang()
  const setPage = useDesigner((state) => state.setPage)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `page:${index}`, disabled: readOnly })

  return (
    <button type="button" ref={setNodeRef} lang={title ? lang : undefined} className={classes.pageTab} data-active={active} data-dragging={isDragging} style={dragStyle(transform, transition)} {...attributes} {...listeners} role="tab" aria-selected={active} onClick={() => setPage(index)}>
      {title || t('designer.pageNumber', { number: index + 1 })}
    </button>
  )
}

// The static preview takes the form's language for its UI labels too, as the wizard would; design keeps the designer's labels.
function PaperFrame({ clean, language, children }: { clean: boolean; language: 'en' | 'dv'; children: ReactNode }) {
  if (clean) return <FormLanguage language={language} withUiLabels className={`${classes.paper} ${classes.clean}`}>{children}</FormLanguage>
  return <div className={classes.paper} dir={language === 'dv' ? 'rtl' : 'ltr'}>{children}</div>
}

export function Canvas({ readOnly }: { readOnly: boolean }) {
  const t = useT()
  const l = useFormText()
  const formLanguage = useDesigner((state) => state.formLanguage)
  const canvasView = useDesigner((state) => state.canvasView)
  const setCanvasView = useDesigner((state) => state.setCanvasView)
  const definition = useDesigner((state) => state.definition)
  const formContext = useFormContext()
  const clean = canvasView === 'static' ? { context: formContext, answers: applyPrefill(definition, {}, formContext.prefill) } : null
  const page = useDesigner((state) => state.page)
  const select = useDesigner((state) => state.select)
  const current = definition.pages[page]

  const rowIds = current.rows.map((_, rowIndex) => `row:${rowIndex}`)
  const pageIds = definition.pages.map((_, index) => `page:${index}`)

  return (
    <section className={classes.canvasPane} aria-label={t('designer.canvasAria')}>
      <div className={classes.pageTabs} role="tablist" aria-label={t('designer.pagesAria')}>
        <SortableContext items={pageIds} strategy={horizontalListSortingStrategy}>
          {definition.pages.map((item, index) => (
            <PageTab key={pageIds[index]} index={index} title={l(item.title)} active={index === page} readOnly={readOnly} />
          ))}
        </SortableContext>
        {!readOnly && (
          <ActionIcon variant="subtle" color="gray" aria-label={t('designer.addPage')} onClick={addPage}>
            <IconPlus size={16} />
          </ActionIcon>
        )}
        <SegmentedControl
          size="xs"
          className={classes.canvasViews}
          aria-label={t('designer.canvasView')}
          value={canvasView}
          onChange={(value) => setCanvasView(value as CanvasView)}
          data={[
            { value: 'design', label: t('designer.viewDesign') },
            { value: 'static', label: t('designer.viewStatic') },
            { value: 'live', label: t('designer.viewLive') },
            { value: 'json', label: t('designer.viewJson') },
          ]}
        />
      </div>

      {canvasView === 'live' || canvasView === 'json' ? <PreviewCanvas view={canvasView} /> : (
      <CleanPreview.Provider value={clean}>
      <div className={classes.canvasScroll} onClick={() => select({ kind: 'page' })}>
        <PaperFrame clean={clean !== null} language={formLanguage}>
          <div className={classes.pageHeading}>
            <span className={classes.pageTitle} lang={current.title ? formLanguage : undefined}>{l(current.title) || t('designer.untitledPage')}</span>
            {!clean && <ShownWhen condition={current.showIf} />}
          </div>
          {current.description && <Text size="sm" c="dimmed" mb="md" lang={formLanguage}>{l(current.description)}</Text>}

          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            <div className={classes.rowStack}>
              {current.rows.map((row, rowIndex) => (
                <RowBlock key={rowIds[rowIndex]} row={row} rowIndex={rowIndex} rowCount={current.rows.length} readOnly={readOnly} />
              ))}
            </div>
          </SortableContext>
          {!readOnly && <EndZone />}
        </PaperFrame>
      </div>
      </CleanPreview.Provider>
      )}
    </section>
  )
}
