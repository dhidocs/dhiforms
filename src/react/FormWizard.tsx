import {
  applyPrefill,
  computeValues,
  evaluateCondition,
  fieldPath,
  itemScope,
  ownValue,
  pageBlockers,
  pageRuleResults,
  repeatedItems,
  runRules,
  setAnswer,
  validatePage,
  visibleFields,
  visibleMessages,
  visiblePages,
  visibleRows,
  type Answers,
  type Field,
  type FormState,
  type ItemScope,
  type LookupResult,
  type Lookups,
  type Page,
  type Row,
  type RuleOutcome,
} from '../core'
import { Alert, Anchor, Button, Group, Loader, Text } from '@mantine/core'
import { IconAlertCircle, IconAlertTriangle, IconCheck, IconCircleX, IconFlag, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react'
import { isEqual, mapValues } from 'lodash-es'
import { useEffect, useRef, useState } from 'react'
import { useDhiforms } from './config'
import { formatSavedTime } from './format'
import { useT } from './labels'
import { AnswerValue, ComputedValue } from './display'
import { FieldInput } from './FieldInput'
import classes from './forms.module.css'
import { FieldGrid, TextRow } from './layout'
import { LookupField } from './LookupField'
import type { FlagInfo, FormContext, FormEnd, FormWizardProps } from './types'
import { useLocalize } from './useLocalize'

const messageColors = { info: 'blue', warning: 'yellow', success: 'green', error: 'red' }
const lower = (text: string) => text.toLowerCase()

// Everything a field needs from the wizard, passed down once instead of prop by prop.
type WizardEnv = {
  state: FormState
  context: FormContext
  errors: Record<string, string>
  warnings: Record<string, string>
  flags: FlagInfo[]
  isEditable: (path: string) => boolean
  correction: boolean
  setValue: (path: string, value: unknown) => void
  setRepeated: (rowKey: string, change: (items: Answers[]) => Answers[]) => void
  reportLookup: (path: string, result: LookupResult | undefined) => void
}

// Waits for option lists so the first render already has labels; the wizard's own state starts once.
export function FormWizard(props: FormWizardProps) {
  if (props.context.ready === false) return <Loader size="sm" />
  return <WizardBody {...props} />
}

function WizardBody({ definition, answers: initialAnswers, context, onSubmit, onSaveDraft, savedAt = null, submitLabel, editablePaths, flags = [], onChange, onEndForm, endFormActions, initialPageKey, onPageChange }: FormWizardProps) {
  const t = useT()
  const l = useLocalize()
  const [answers, setAnswers] = useState(initialAnswers)
  const [liveLookups, setLiveLookups] = useState<Lookups>({})
  const config = useDhiforms()
  const today = config.today(context.now ? new Date(context.now) : new Date())
  const lookups = { ...context.lookups, ...liveLookups }
  const effective = computeValues(definition, applyPrefill(definition, answers, context.prefill), today, lookups)
  const state: FormState = { answers: effective, lookups, lists: context.lists, today }
  const pages = visiblePages(definition, effective, lookups)
  const outcomes = runRules(definition, state)

  const correction = editablePaths !== undefined
  const isEditable = (path: string) => !editablePaths || editablePaths.includes(path)
  const scope = correction ? isEditable : undefined
  const openFlags = flags.filter((flag) => flag.status === 'open')
  const flaggedFields = pages.flatMap((page) =>
    visibleFields(page, effective, lookups)
      .filter((visible) => openFlags.some((flag) => flag.fieldPath === visible.path))
      .map((visible) => ({ page, ...visible })),
  )

  // Reopening resumes at the first flagged step in a correction, else at the first step with unanswered or invalid fields.
  const [startIndex] = useState(() => {
    if (flaggedFields.length > 0) return pages.findIndex((page) => page.key === flaggedFields[0].page.key)
    if (Object.keys(initialAnswers).length === 0) return 0
    const unfinished = pages.findIndex((page) => Object.keys(validatePage(page, state, scope)).length > 0)
    return unfinished === -1 ? pages.length - 1 : unfinished
  })
  const [initialIndex] = useState(() => pages.findIndex((page) => page.key === initialPageKey))
  const [pageKey, setPageKey] = useState(pages[initialIndex === -1 ? startIndex : initialIndex]?.key)
  const [furthest, setFurthest] = useState(Math.max(startIndex, initialIndex))
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(savedAt)
  const [savedAnswers, setSavedAnswers] = useState(initialAnswers)
  const [ended, setEnded] = useState<FormEnd | null>(null)
  const wizardRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  const pageIndex = Math.max(0, pages.findIndex((page) => page.key === pageKey))
  const page = pages[pageIndex] ?? definition.pages[0]
  const isLastPage = pageIndex === pages.length - 1
  const problemsOn = (candidate: Page) => ({ ...pageRuleResults(candidate, state, outcomes, scope).errors, ...validatePage(candidate, state, scope) })
  const pageRules = pageRuleResults(page, state, outcomes, scope)
  const pageErrors = { ...pageRules.errors, ...validatePage(page, state, scope) }
  const errors: Record<string, string> = showErrors ? mapValues(pageErrors, l) : {}
  const blockers = isLastPage ? pages.flatMap((candidate) => pageBlockers(candidate, state, scope)) : pageBlockers(page, state, scope)
  const unsaved = !isEqual(answers, savedAnswers)

  useEffect(() => {
    onChange?.(effective)
  }, [answers, liveLookups])

  const env: WizardEnv = {
    state,
    context,
    errors,
    warnings: mapValues(pageRules.warnings, l),
    flags,
    isEditable,
    correction,
    setValue: (path, value) => setAnswers((previous) => setAnswer(previous, path, value)),
    setRepeated: (rowKey, change) => setAnswers((previous) => setAnswer(previous, rowKey, change(previous[rowKey] ?? []))),
    reportLookup: (path, result) =>
      setLiveLookups((previous) => {
        if (isEqual(previous[path], result)) return previous
        const next = { ...previous }
        if (result) next[path] = result
        else delete next[path]
        return next
      }),
  }

  const focusField = (path: string) => {
    requestAnimationFrame(() => {
      const target = wizardRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)
      target?.scrollIntoView({ block: 'center' })
      target?.querySelector<HTMLElement>('input, textarea, button, [tabindex="0"]')?.focus({ preventScroll: true })
    })
  }

  const focusSummary = () => {
    requestAnimationFrame(() => {
      summaryRef.current?.scrollIntoView({ block: 'start' })
      summaryRef.current?.focus({ preventScroll: true })
    })
  }

  const goToPage = (key: string) => {
    setPageKey(key)
    onPageChange?.(key)
    setShowErrors(false)
    setFurthest((previous) => Math.max(previous, pages.findIndex((candidate) => candidate.key === key)))
    requestAnimationFrame(() => {
      wizardRef.current?.scrollIntoView({ block: 'start' })
      wizardRef.current?.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true })
    })
  }

  // The first endForm result from a rule on this step or an earlier one.
  const endFormUpTo = (lastIndex: number) => {
    const keys = pages.slice(0, lastIndex + 1).map((candidate) => candidate.key)
    return outcomes.find((outcome): outcome is Extract<RuleOutcome, { type: 'endForm' }> => outcome.type === 'endForm' && keys.includes(outcome.pageKey) && (!scope || scope(outcome.fieldPath)))
  }

  const endForm = (outcome: Extract<RuleOutcome, { type: 'endForm' }>) => {
    const end: FormEnd = { outcome: outcome.outcome, message: outcome.message, ruleId: outcome.ruleId }
    setEnded(end)
    onEndForm?.(end, effective)
    requestAnimationFrame(() => wizardRef.current?.querySelector<HTMLElement>('[data-exit-title]')?.focus())
  }

  const goNext = () => {
    const end = endFormUpTo(pageIndex)
    if (end) return endForm(end)
    if (Object.keys(pageErrors).length > 0) {
      setShowErrors(true)
      focusSummary()
      return
    }
    goToPage(pages[pageIndex + 1].key)
  }

  const submit = async () => {
    const end = endFormUpTo(pages.length - 1)
    if (end) return endForm(end)
    const firstProblem = pages.find((candidate) => Object.keys(problemsOn(candidate)).length > 0)
    if (firstProblem) {
      setPageKey(firstProblem.key)
      onPageChange?.(firstProblem.key)
      setShowErrors(true)
      focusSummary()
      return
    }
    setSubmitting(true)
    await Promise.resolve(onSubmit(effective, { lookups })).finally(() => setSubmitting(false))
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      await Promise.resolve(onSaveDraft?.(effective, { lookups }))
      setSavedAnswers(answers)
      setLastSavedAt(context.now ?? new Date().toISOString())
    } catch {
      // The page that owns saving shows why it failed; the answers stay marked as unsaved.
    } finally {
      setSaving(false)
    }
  }

  if (ended) {
    return (
      <div className={classes.wizard} ref={wizardRef}>
        <section className={classes.exit} aria-labelledby="wizard-exit-title">
          <IconCircleX size={32} stroke={1.6} className={classes.exitIcon} aria-hidden />
          <h2 id="wizard-exit-title" className={classes.pageTitle} tabIndex={-1} data-exit-title>{t('wizard.notEligibleTitle')}</h2>
          <Text className={classes.exitReason}>{l(ended.message)}</Text>
          <div className={classes.exitActions}>
            {endFormActions}
            <Button variant="default" onClick={() => setEnded(null)}>{t('wizard.backToAnswers')}</Button>
          </div>
        </section>
      </div>
    )
  }

  const visibleOrder = [...visibleRows(page, effective, lookups).flatMap((row) => (row.type === 'repeated' ? [row.key] : [])), ...visibleFields(page, effective, lookups).map((visible) => visible.path)]
  const rank = (path: string) => (visibleOrder.includes(path) ? visibleOrder.indexOf(path) : visibleOrder.length)
  const summary = Object.entries(errors).sort(([left], [right]) => rank(left) - rank(right))
  const blockedAction = isLastPage ? 'submit' : 'continue'
  const saveStatus = !lastSavedAt ? null : t(unsaved ? 'wizard.unsavedChanges' : 'wizard.savedAt', { time: formatSavedTime(lastSavedAt, context.now) })

  return (
    <div className={classes.wizard} ref={wizardRef}>
      {correction && openFlags.length > 0 && (
        <Alert color="yellow" icon={<IconFlag size={18} />} title={openFlags.length === 1 ? t('wizard.fieldToFix') : t('wizard.fieldsToFix', { count: openFlags.length })} className={classes.summary}>
          <Text size="sm">{t('wizard.fixIntro')}</Text>
          <ul className={classes.summaryList}>
            {flaggedFields.map(({ page: flaggedPage, field, path, index }) => (
              <li key={path}>
                <Anchor component="button" type="button" size="sm" onClick={() => goToPage(flaggedPage.key)}>
                  {l(field.label)}
                  {index !== undefined ? ` ${t('wizard.itemNumber', { number: index + 1 })}` : ''}
                </Anchor>
                <Text span size="sm" c="dimmed"> {t('wizard.onPage', { page: l(flaggedPage.title) })}</Text>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {pages.length > 1 && (
        <nav aria-label={t('wizard.steps')}>
          <p className={classes.stepCount}>{t('wizard.stepCount', { current: pageIndex + 1, total: pages.length })}</p>
          <ol className={classes.steps}>
            {pages.map((candidate, index) => {
              const stepState = index === pageIndex ? 'current' : index < Math.max(furthest, pageIndex) ? 'done' : 'todo'
              const flaggedHere = flaggedFields.some((flagged) => flagged.page.key === candidate.key)
              return (
                <li key={candidate.key} className={classes.step} data-state={stepState}>
                  <button
                    type="button"
                    className={classes.stepButton}
                    disabled={index > Math.max(furthest, pageIndex) && !correction}
                    aria-current={stepState === 'current' ? 'step' : undefined}
                    onClick={() => goToPage(candidate.key)}
                  >
                    <span className={classes.stepMarker} data-flagged={flaggedHere || undefined}>{stepState === 'done' ? <IconCheck size={14} stroke={2.5} /> : index + 1}</span>
                    <span className={classes.stepTitle}>{l(candidate.title)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      )}

      {summary.length > 0 && (
        <Alert
          ref={summaryRef}
          tabIndex={-1}
          color="red"
          icon={<IconAlertCircle size={18} />}
          title={summary.length === 1 ? t('wizard.problemOne') : t('wizard.problems', { count: summary.length })}
          className={classes.errorSummary}
        >
          <ul className={classes.summaryList}>
            {summary.map(([path, message]) => (
              <li key={path}>
                {visibleOrder.includes(path) ? (
                  <Anchor component="button" type="button" size="sm" c="red.8" onClick={() => focusField(path)}>{message}</Anchor>
                ) : (
                  <Text size="sm">{message}</Text>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <section className={classes.page} aria-labelledby="wizard-page-title">
        <h2 id="wizard-page-title" className={classes.pageTitle} tabIndex={-1} data-page-title>{l(page.title)}</h2>
        {page.description && <Text c="dimmed" className={classes.pageDescription}>{l(page.description)}</Text>}
        <div className={classes.rows}>
          {visibleRows(page, effective, lookups).map((row, rowIndex) => (
            <WizardRow key={row.id ?? rowIndex} row={row} env={env} />
          ))}
        </div>
      </section>

      <div className={classes.footer}>
        {blockers.length > 0 && (
          <Alert color="red" icon={<IconAlertCircle size={18} />} role="alert">
            {t(blockedAction === 'submit' ? 'wizard.cantSubmit' : 'wizard.cantContinue', { reason: l(blockers[0].text) })}
          </Alert>
        )}
        <div className={classes.footerBar}>
          {pageIndex > 0 && <Button variant="default" onClick={() => goToPage(pages[pageIndex - 1].key)}>{t('wizard.back')}</Button>}
          <div className={classes.footerEnd}>
            {onSaveDraft && saveStatus && <Text size="sm" c="dimmed" role="status" className={classes.saveStatus}>{saveStatus}</Text>}
            {onSaveDraft && <Button variant="default" loading={saving} onClick={saveDraft}>{t('wizard.saveDraft')}</Button>}
            {isLastPage ? (
              <Button onClick={submit} loading={submitting} disabled={blockers.length > 0}>{submitLabel ?? t('wizard.submit')}</Button>
            ) : (
              <Button onClick={goNext} disabled={blockers.length > 0}>{t('wizard.next')}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WizardRow({ row, env }: { row: Row; env: WizardEnv }) {
  const t = useT()
  const l = useLocalize()
  const { answers, lookups } = env.state
  if (row.type === 'fields') {
    const fields = row.fields.filter((field) => evaluateCondition(field.showIf, { answers, lookups }))
    return (
      <FieldGrid fields={fields}>
        {(field) => <WizardField field={field} path={field.key} env={env} />}
      </FieldGrid>
    )
  }

  if (row.type !== 'repeated') return <TextRow row={row} />

  const items = repeatedItems(row, answers)
  const itemLabel = l(row.itemLabel) || t('wizard.item')
  const canChange = row.repeatType === 'add' && !env.correction
  const minimum = row.minRepeats ?? 0
  const maximum = row.maxRepeats ?? Infinity

  return (
    <div className={classes.repeated} data-row-id={row.id}>
      {row.label && <Text fw={600}>{l(row.label)}</Text>}
      {items.length === 0 && <Text c="dimmed" size="sm">{t('wizard.noItems', { item: lower(itemLabel) })}</Text>}
      {items.map((values, index) => {
        const item = itemScope(row, index, values)
        const fields = row.fields.filter((field) => evaluateCondition(field.showIf, { answers, lookups, item }))
        return (
          <div key={index} className={classes.item} role="group" aria-label={`${itemLabel} ${index + 1}`}>
            <Group justify="space-between" className={classes.itemHeader}>
              <Text fw={500}>{itemLabel} {index + 1}</Text>
              {canChange && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="compact-sm"
                  leftSection={<IconTrash size={14} />}
                  disabled={items.length <= minimum}
                  aria-label={t('wizard.removeItem', { item: lower(itemLabel), number: index + 1 })}
                  onClick={() => env.setRepeated(row.key, (stored) => stored.filter((_, position) => position !== index))}
                >
                  {t('wizard.remove')}
                </Button>
              )}
            </Group>
            <FieldGrid fields={fields}>
              {(field) => <WizardField field={field} path={fieldPath(field.key, row.key, index)} item={item} env={env} />}
            </FieldGrid>
          </div>
        )
      })}
      {canChange && (
        <div data-path={row.key} data-invalid={env.errors[row.key] ? 'true' : undefined}>
          <Group gap="sm">
            <Button variant="default" leftSection={<IconPlus size={16} />} disabled={items.length >= maximum} onClick={() => env.setRepeated(row.key, (stored) => [...stored, {}])}>
              {t('wizard.addItem', { item: lower(itemLabel) })}
            </Button>
            {items.length >= maximum && <Text size="sm" c="dimmed">{t('wizard.maxItems', { max: maximum })}</Text>}
          </Group>
          {env.errors[row.key] && <Text size="sm" className={classes.errorText} role="alert">{env.errors[row.key]}</Text>}
        </div>
      )}
    </div>
  )
}

function WizardField({ field, path, item, env }: { field: Field; path: string; item?: ItemScope; env: WizardEnv }) {
  const t = useT()
  const l = useLocalize()
  const { answers, lookups } = env.state
  const value = ownValue(item ? item.values : answers, field.key)
  const isComputed = field.type === 'computed'
  const editable = env.isEditable(path) && !field.readOnly && !isComputed
  const openFlags = env.flags.filter((flag) => flag.fieldPath === path && flag.status === 'open')
  const error = env.errors[path]
  const warning = env.warnings[path]
  const messages = editable || isComputed ? visibleMessages(field, { answers, lookups, item }) : []

  // A lookup in a correction only re-runs when one of the fields it reads from is being fixed.
  const lookupLive = !field.readOnly && (!env.correction || Object.values(field.inputs ?? {}).some((source) => env.isEditable(path.replace(/[^.]+$/, source))))

  return (
    <div className={classes.field} data-path={path} data-invalid={error ? 'true' : undefined} data-flagged={openFlags.length > 0 || undefined}>
      {openFlags.map((flag) => (
        <Alert key={flag.remarks} color="yellow" icon={<IconFlag size={18} />} title={flag.by ? t('wizard.reviewerAsked', { by: flag.by }) : t('wizard.fixRequested')} className={classes.remarks}>
          {flag.remarks}
        </Alert>
      ))}

      {isComputed ? (
        <ComputedValue field={field} value={value} context={env.context} error={error} />
      ) : field.type === 'lookup' ? (
        <LookupField
          field={field}
          path={path}
          answers={answers}
          item={item?.values}
          context={env.context}
          value={value}
          live={lookupLive}
          error={error}
          onChange={(next) => env.setValue(path, next)}
          onResult={(result) => env.reportLookup(path, result)}
        />
      ) : editable ? (
        <FieldInput field={field} path={path} value={value} error={error} context={env.context} onChange={(next) => env.setValue(path, next)} />
      ) : (
        <div className={classes.locked}>
          <Text className={classes.lockedLabel}>{l(field.label)}</Text>
          <AnswerValue field={field} value={value} context={env.context} />
        </div>
      )}

      {warning && (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          {warning}
        </Alert>
      )}

      {messages.map((message, index) => (
        <Alert key={index} color={messageColors[message.tone]} icon={<IconInfoCircle size={18} />} role={message.blocking ? 'alert' : undefined}>
          {l(message.text)}
        </Alert>
      ))}
    </div>
  )
}
