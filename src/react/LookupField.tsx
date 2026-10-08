import { nidPattern, type Answers, type Field, type LookupResult } from '../core'
import { Input } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useDhiforms } from './config'
import { useT } from './labels'
import { LookupCard } from './display'
import classes from './forms.module.css'
import type { FormContext } from './types'
import { useLocalize } from './useLocalize'

// Maps the connector's input names to values: "self.<name>" reads context.prefill (e.g. "self.nid", the person's own ID), anything else is a sibling field (same repeated item first).
export function lookupInputs(field: Field, answers: Answers, item: Answers | undefined, context: FormContext) {
  const inputs: Record<string, string> = {}
  for (const [name, source] of Object.entries(field.inputs ?? {})) {
    const own = source.startsWith('self.') ? context.prefill[source] || answers[source.slice('self.'.length)] : undefined
    inputs[name] = String((source.startsWith('self.') ? own : (item?.[source] ?? answers[source])) ?? '')
  }
  return inputs
}

// Runs the connector once the inputs look valid, shows a status card, keeps only the record reference as the answer and reports the result up for rules.
export function LookupField({ field, path, answers, item, context, value, onChange, onResult, live, error }: {
  field: Field
  path: string
  answers: Answers
  item?: Answers
  context: FormContext
  value: any
  onChange: (value: { ref: number | null }) => void
  onResult?: (result: LookupResult | undefined) => void
  live: boolean
  error?: string
}) {
  const l = useLocalize()
  const t = useT()
  const { runLookup } = useDhiforms()
  const inputs = lookupInputs(field, answers, item, context)
  const inputsLookValid = Object.entries(inputs).every(([name, input]) => (name === 'nid' ? nidPattern.test(input) : input !== ''))
  const ready = live && inputsLookValid && Object.keys(inputs).length > 0

  const query = useQuery({
    queryKey: context.submissionId ? ['dhiforms', 'lookups', field.connector, inputs, context.submissionId, path] : ['dhiforms', 'lookups', field.connector, inputs],
    queryFn: () => {
      if (!runLookup) throw new Error(t('wizard.lookupNotConfigured', { connector: field.connector ?? '' }))
      return runLookup({ connector: field.connector!, inputs, fieldPath: path, submissionId: context.submissionId })
    },
    enabled: ready,
    staleTime: Infinity,
    retry: false,
  })

  const recordId = query.data?.recordId ?? null
  useEffect(() => {
    if (query.data && (value?.ref ?? null) !== recordId) onChange({ ref: recordId })
  }, [query.data])

  const failed = query.isError ? { status: 'error' as const, checkedAt: context.now ?? new Date().toISOString(), data: { message: runLookup ? t('wizard.lookupFailed') : (query.error as Error).message } } : undefined
  const result = ready ? (query.data ?? failed ?? context.lookups[path]) : context.lookups[path]
  const checking = ready && query.isFetching
  const reported: LookupResult | undefined = checking ? { status: 'pending' } : result

  useEffect(() => {
    onResult?.(reported)
  })

  return (
    <Input.Wrapper label={l(field.label)} description={l(field.help) || undefined} error={error} className={classes.lookup}>
      <div className={classes.lookupSlot}>
        {!result && !checking && !ready ? (
          <p className={classes.lookupHint}>{live ? t('wizard.lookupWaiting') : t('wizard.notChecked')}</p>
        ) : (
          <LookupCard result={result} checking={checking} onCheckAgain={ready ? () => query.refetch() : undefined} />
        )}
      </div>
    </Input.Wrapper>
  )
}
