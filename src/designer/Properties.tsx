import { localize, type Row } from '../core'
import { Button, NumberInput, SegmentedControl, Text, TextInput } from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconArrowLeft, IconArrowRight, IconTrash } from '@tabler/icons-react'
import { useT } from '../react/labels'
import { useDhiforms } from '../react/config'
import { ConditionBuilder } from './ConditionBuilder'
import { FieldProperties } from './FieldProperties'
import { optionalNumber, Section, TextProperty } from './PropertyParts'
import { deleteField, deletePage, deleteRow, movePage, updatePage, updateRow, useDesigner } from './store'
import { fieldTypeInfo, isCamelCase, rowTypeInfo, type FormLists } from './model'
import classes from './designer.module.css'

function PageProperties({ lists }: { lists: FormLists }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const index = useDesigner((state) => state.page)
  const page = definition.pages[index]

  const keyError = !isCamelCase(page.key)
    ? t('designer.pageKeyInvalid', { key: page.key })
    : definition.pages.some((other, at) => at !== index && other.key === page.key)
      ? t('designer.pageKeyTaken', { key: page.key })
      : undefined

  const confirmDelete = () => {
    if (definition.pages.length === 1) {
      modals.open({ title: t('designer.onePageTitle'), children: <Text size="sm">{t('designer.onePageText')}</Text> })
      return
    }
    const fieldCount = page.rows.reduce((sum, row) => sum + ('fields' in row ? row.fields.length : 0), 0)
    const fieldsText = fieldCount === 0 ? t('designer.deletePageNoFields') : fieldCount === 1 ? t('designer.deletePageFieldsOne') : t('designer.deletePageFields', { count: fieldCount })
    modals.openConfirmModal({
      title: t('designer.deletePageTitle', { name: localize(page.title) || page.key }),
      children: <Text size="sm">{fieldsText} {t('designer.undoHint')}</Text>,
      labels: { confirm: t('designer.deletePage'), cancel: t('designer.keepPage') },
      confirmProps: { color: 'red' },
      onConfirm: () => deletePage(index),
    })
  }

  return (
    <>
      <Section title={t('designer.page')}>
        <TextProperty label={t('designer.labelTitle')} value={page.title} onChange={(title) => updatePage(index, { title })} />
        <TextInput label={t('designer.labelKey')} description={t('designer.pageKeyHelp')} value={page.key} error={keyError} onChange={(event) => updatePage(index, { key: event.currentTarget.value })} />
        <TextProperty label={t('designer.labelDescription')} description={t('designer.pageDescriptionHelp')} multiline minRows={2} value={page.description} onChange={(description) => updatePage(index, { description: description || undefined })} />
      </Section>
      <Section title={t('designer.shownWhenSection')}>
        <ConditionBuilder value={page.showIf} lists={lists} emptyText={t('designer.pageAlwaysShown')} onChange={(next) => updatePage(index, { showIf: next })} />
      </Section>
      <Section title={t('designer.position')}>
        <Text size="xs" c="dimmed">{t('designer.pagePosition', { number: index + 1, total: definition.pages.length })}</Text>
        <div className={classes.pair}>
          <Button variant="default" size="xs" leftSection={<IconArrowLeft size={14} />} disabled={index === 0} onClick={() => movePage(index, index - 1)}>{t('designer.moveEarlier')}</Button>
          <Button variant="default" size="xs" leftSection={<IconArrowRight size={14} />} disabled={index === definition.pages.length - 1} onClick={() => movePage(index, index + 1)}>{t('designer.moveLater')}</Button>
        </div>
      </Section>
      <Section title={t('designer.delete')}>
        <Button variant="default" color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>{t('designer.deletePage')}</Button>
      </Section>
    </>
  )
}

function RowProperties({ row, rowIndex, lists }: { row: Row; rowIndex: number; lists: FormLists }) {
  const t = useT()
  const hasText = row.type === 'heading' || row.type === 'subheading' || row.type === 'paragraph'

  return (
    <>
      <Section title={rowTypeInfo[row.type].label}>
        {hasText && (
          <TextProperty label={t('designer.labelText')} multiline minRows={row.type === 'paragraph' ? 4 : 1} value={row.text} onChange={(text) => updateRow(rowIndex, { text })} />
        )}
        {row.type === 'break' && <Text size="sm" c="dimmed">{t('designer.breakHelp')}</Text>}
        {row.type === 'fields' && <Text size="sm" c="dimmed">{t('designer.fieldsRowHelp')}</Text>}
        {row.type === 'repeated' && <RepeatedProperties row={row} rowIndex={rowIndex} />}
      </Section>

      <Section title={t('designer.shownWhenSection')}>
        <ConditionBuilder value={row.showIf} lists={lists} emptyText={t('designer.rowAlwaysShown')} onChange={(next) => updateRow(rowIndex, { showIf: next })} />
      </Section>

      <Section title={t('designer.delete')}>
        <Button variant="default" leftSection={<IconTrash size={16} />} onClick={() => deleteRow(rowIndex)}>{t('designer.deleteRow')}</Button>
      </Section>
    </>
  )
}

function RepeatedProperties({ row, rowIndex }: { row: Extract<Row, { type: 'repeated' }>; rowIndex: number }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const page = useDesigner((state) => state.page)
  const clash = definition.pages.some((other, pageIndex) =>
    other.rows.some((candidate, candidateIndex) => {
      if (pageIndex === page && candidateIndex === rowIndex) return false
      return (candidate.type === 'repeated' && candidate.key === row.key) || ('fields' in candidate && candidate.fields.some((field) => field.key === row.key))
    }),
  )
  const keyError = !isCamelCase(row.key) ? t('designer.groupKeyInvalid', { key: row.key }) : clash ? t('designer.groupKeyTaken', { key: row.key }) : undefined

  return (
    <>
      <TextInput label={t('designer.groupKey')} description={t('designer.groupKeyHelp')} value={row.key} error={keyError} onChange={(event) => updateRow(rowIndex, { key: event.currentTarget.value })} />
      <TextProperty label={t('designer.groupLabel')} description={t('designer.groupLabelHelp')} value={row.label} onChange={(label) => updateRow(rowIndex, { label: label || undefined })} />
      <TextProperty label={t('designer.itemLabel')} description={t('designer.itemLabelHelp')} value={row.itemLabel} onChange={(itemLabel) => updateRow(rowIndex, { itemLabel: itemLabel || undefined })} />
      <div>
        <Text size="sm" fw={500} mb={4}>{t('designer.howManyItems')}</Text>
        <SegmentedControl fullWidth size="xs" aria-label={t('designer.repeatTypeAria')} value={row.repeatType} onChange={(next) => updateRow(rowIndex, { repeatType: next })} data={[{ value: 'add', label: t('designer.repeatAdd') }, { value: 'fixed', label: t('designer.repeatFixedNumber') }]} />
      </div>
      {row.repeatType === 'fixed' ? (
        <NumberInput label={t('designer.numberOfItems')} min={1} value={row.numRepeats ?? 1} onChange={(next) => updateRow(rowIndex, { numRepeats: optionalNumber(next) })} />
      ) : (
        <div className={classes.pair}>
          <NumberInput label={t('designer.atLeast')} min={0} value={row.minRepeats ?? ''} onChange={(next) => updateRow(rowIndex, { minRepeats: optionalNumber(next) })} />
          <NumberInput label={t('designer.atMost')} min={1} value={row.maxRepeats ?? ''} onChange={(next) => updateRow(rowIndex, { maxRepeats: optionalNumber(next) })} />
        </div>
      )}
    </>
  )
}

export function Properties({ readOnly }: { readOnly: boolean }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const page = useDesigner((state) => state.page)
  const selection = useDesigner((state) => state.selection)
  const { lists = {}, connectors = [] } = useDhiforms()

  const row = selection.kind === 'page' ? undefined : definition.pages[page].rows[selection.row]
  const field = selection.kind === 'field' && row && 'fields' in row ? row.fields[selection.field] : undefined

  const heading = selection.kind === 'page' ? t('designer.pageProperties') : field ? t('designer.fieldHeading', { type: fieldTypeInfo[field.type].label }) : row ? rowTypeInfo[row.type].label : ''

  return (
    <aside className={classes.properties} aria-label={t('designer.propertiesAria')}>
      <h2 className={classes.paneHeading}>{heading}</h2>
      <fieldset className={classes.fieldset} disabled={readOnly} inert={readOnly}>
        {selection.kind === 'page' && <PageProperties lists={lists} />}
        {selection.kind === 'row' && row && <RowProperties row={row} rowIndex={selection.row} lists={lists} />}
        {selection.kind === 'field' && field && <FieldProperties field={field} rowIndex={selection.row} fieldIndex={selection.field} lists={lists} connectors={connectors} onDelete={() => deleteField(selection.row, selection.field)} />}
      </fieldset>
    </aside>
  )
}
