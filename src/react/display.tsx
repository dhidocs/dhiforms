import { listOptions, localize, type Field, type Language, type LookupResult } from '../core'
import { Anchor, CloseButton, Loader, Text } from '@mantine/core'
import { useId } from 'react'
import { IconAlertTriangle, IconCircleCheck, IconCircleDashed, IconFileText } from '@tabler/icons-react'
import { useDhiforms } from './config'
import { formatDate, formatDateTime, formatFileSize, formatMoney, formatNumber } from './format'
import classes from './forms.module.css'
import { labelIn, useT } from './labels'
import type { FormContext } from './types'
import { useLocalize } from './useLocalize'

function Money({ value }: { value: number }) {
  const { currency } = useDhiforms()
  return <span className="df-tabular">{formatMoney(value, currency)}</span>
}

const humanize = (key: string) => {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const lookupHeadlines = {
  found: 'wizard.lookupFound',
  not_found: 'wizard.lookupNotFound',
  error: 'wizard.lookupError',
  pending: 'wizard.lookupPending',
} as const

// Small status card for a lookup answer: pending, found, not found or error, with the time it was checked.
export function LookupCard({ result, checking, onCheckAgain }: { result?: LookupResult; checking?: boolean; onCheckAgain?: () => void }) {
  const t = useT()
  if (!result && !checking) return <Text c="dimmed" size="sm">{t('wizard.notChecked')}</Text>
  const status = checking ? 'pending' : result!.status
  const details = Object.entries(result?.data ?? {}).filter(([key]) => key !== 'message')
  const message = result?.data?.message as string | undefined

  return (
    <div className={classes.lookupCard} data-status={status} role="status">
      <span className={classes.lookupIcon}>
        {status === 'pending' && <Loader size={16} />}
        {status === 'found' && <IconCircleCheck size={18} />}
        {status === 'not_found' && <IconCircleDashed size={18} />}
        {status === 'error' && <IconAlertTriangle size={18} />}
      </span>
      <div className={classes.lookupBody}>
        <Text fw={500} size="sm">{t(lookupHeadlines[status])}</Text>
        {details.map(([key, value]) => (
          <Text key={key} size="sm">
            <Text span c="dimmed">{humanize(key)}: </Text>
            {String(value)}
          </Text>
        ))}
        {status === 'error' && <Text size="sm">{message ?? t('wizard.lookupFailed')}</Text>}
        {!checking && result?.checkedAt && <Text size="xs" c="dimmed">Checked {formatDateTime(result.checkedAt)}</Text>}
        {onCheckAgain && !checking && (
          <Anchor component="button" type="button" size="sm" onClick={onCheckAgain}>{t('wizard.checkAgain')}</Anchor>
        )}
      </div>
    </div>
  )
}

// Answers to file fields are document ids from the host, or { name, size } for files picked in this session.
export function resolveFiles(value: any, context: FormContext, fileUrl?: (id: number) => string | undefined) {
  const entries: any[] = Array.isArray(value) ? value : []
  return entries.map((entry) => {
    if (typeof entry === 'number') {
      const document = context.documents.find((candidate) => candidate.id === entry)
      const href = fileUrl?.(entry)
      return document ? { name: document.fileName, size: document.sizeBytes, href } : { name: `Document ${entry}`, size: null, href }
    }
    return { name: entry.name, size: entry.size ?? null, href: undefined }
  })
}

export function FileChips({ files, onRemove }: { files: { name: string; size: number | null; href?: string }[]; onRemove?: (index: number) => void }) {
  const t = useT()
  return (
    <ul className={classes.chips}>
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} className={classes.chip}>
          <IconFileText size={16} stroke={1.6} aria-hidden />
          <span className={classes.chipName}>{file.href ? <a href={file.href} target="_blank" rel="noreferrer">{file.name}</a> : file.name}</span>
          {file.size != null && <span className={classes.chipSize}>{formatFileSize(file.size)}</span>}
          {onRemove && <CloseButton size="md" className={classes.chipRemove} aria-label={t('wizard.removeFile', { name: file.name })} onClick={() => onRemove(index)} />}
        </li>
      ))}
    </ul>
  )
}

export const isBlank = (value: unknown) => value == null || value === '' || (Array.isArray(value) && value.length === 0)

// The formatted answer of one field for read-only display. `lookup` is the result for lookup fields.
export function AnswerValue({ field, value, context, lookup }: { field: Field; value: any; context: FormContext; lookup?: LookupResult }) {
  const l = useLocalize()
  const t = useT()
  const { fileUrl } = useDhiforms()
  if (field.type === 'lookup') return <LookupCard result={lookup} />
  if (field.type === 'computed') {
    if (value == null) return <Text className={classes.answer} c="dimmed">{t('wizard.notCalculated')}</Text>
    if (field.format === 'amount') return <Text className={classes.answer}><Money value={Number(value)} /></Text>
    return <Text className={classes.answer} data-tabular>{formatNumber(Number(value))}</Text>
  }
  if (field.type === 'checkbox') return <Text className={classes.answer}>{t(value === true ? 'common.yes' : 'common.no')}</Text>
  if (isBlank(value)) return <Text className={classes.answer} c="dimmed">{t('wizard.notProvided')}</Text>

  if (field.type === 'file') return <FileChips files={resolveFiles(value, context, fileUrl)} />
  if (field.type === 'amount') return <Text className={classes.answer}><Money value={Number(value)} /></Text>
  if (field.type === 'number') return <Text className={classes.answer} data-tabular>{formatNumber(Number(value))}</Text>
  if (field.type === 'date') return <Text className={classes.answer} data-tabular>{formatDate(value)}</Text>
  if (field.type === 'phone') return <Text className={classes.answer} data-tabular>+960 {value}</Text>
  if (field.type === 'nid') return <Text className={classes.answer} data-tabular>{value}</Text>
  if (field.type === 'textarea') return <Text className={classes.answer} data-multiline>{value}</Text>

  if (field.type === 'radio' || field.type === 'select' || field.type === 'checkboxGroup') {
    const options = listOptions(field, context.lists)
    const labelOf = (selected: string) => l(options.find((option) => option.value === selected)?.label) || selected
    const text = Array.isArray(value) ? value.map(labelOf).join(', ') : labelOf(value)
    return (
      <>
        <Text className={classes.answer}>{text}</Text>
        {field.type === 'select' && <RelatedInfo field={field} value={value} context={context} />}
      </>
    )
  }
  return <Text className={classes.answer} dir={field.dir}>{String(value)}</Text>
}

// Related info such as the council of the chosen island, read from the list item's meta.
export function RelatedInfo({ field, value, context }: { field: Field; value: any; context: FormContext }) {
  const l = useLocalize()
  const lines = (field.related ?? [])
    .map((related) => {
      const item = (context.lists[related.from] ?? []).find((candidate) => candidate.value === value)
      const text = item?.meta?.[related.property]
      return text ? `${l(related.label)}: ${text}` : null
    })
    .filter(Boolean)
  if (value == null || value === '' || lines.length === 0) return null
  return lines.map((line) => (
    <Text key={line} size="sm" c="dimmed">{line}</Text>
  ))
}

// Plain-text version of an answer, used for the struck-through previous value in compare mode.
export function answerText(field: Field, value: any, context: FormContext, language: Language, currency?: string) {
  if (field.type === 'computed' && value == null) return labelIn(language, 'wizard.notCalculated')
  if (isBlank(value)) return labelIn(language, 'wizard.notProvided')
  if (field.type === 'computed') return field.format === 'amount' ? formatMoney(Number(value), currency) : formatNumber(Number(value))
  if (field.type === 'file') return resolveFiles(value, context).map((file) => file.name).join(', ')
  if (field.type === 'amount') return formatMoney(Number(value), currency)
  if (field.type === 'number') return formatNumber(Number(value))
  if (field.type === 'date') return formatDate(value)
  if (field.type === 'checkbox') return labelIn(language, value === true ? 'common.yes' : 'common.no')
  if (field.type === 'lookup') return value?.ref ? labelIn(language, 'wizard.lookupRecord', { ref: value.ref }) : labelIn(language, 'wizard.noRecord')
  if (field.type === 'radio' || field.type === 'select' || field.type === 'checkboxGroup') {
    const options = listOptions(field, context.lists)
    const labelOf = (selected: string) => localize(options.find((option) => option.value === selected)?.label, language) || selected
    return Array.isArray(value) ? value.map(labelOf).join(', ') : labelOf(value)
  }
  return String(value)
}

// A computed field in the wizard: read-only, recalculated on every change and announced politely to screen readers.
export function ComputedValue({ field, value, context, error }: { field: Field; value: unknown; context: FormContext; error?: string }) {
  const l = useLocalize()
  const id = useId()
  return (
    <div className={classes.computed} role="group" aria-labelledby={`${id}-label`} aria-describedby={[field.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}>
      <Text id={`${id}-label`} className={classes.computedLabel}>{l(field.label)}</Text>
      <div aria-live="polite" className={classes.computedValue}>
        <AnswerValue field={field} value={value} context={context} />
      </div>
      {field.help && <Text id={`${id}-help`} size="sm" c="dimmed">{l(field.help)}</Text>}
      {error && <Text id={`${id}-error`} size="sm" className={classes.errorText}>{error}</Text>}
    </div>
  )
}
