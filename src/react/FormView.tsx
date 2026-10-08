import { computeValues, evaluateCondition, fieldPath, getAnswer, itemScope, ownValue, repeatedItems, visibleFields, visiblePages, visibleRows, type Answers, type Field, type Page, type Row } from '../core'
import { ActionIcon, Badge, Loader, Tabs, Text, Title } from '@mantine/core'
import { IconFlag } from '@tabler/icons-react'
import { useDhiforms } from './config'
import { useLabelLanguage } from './labels'
import { AnswerValue, answerText } from './display'
import classes from './forms.module.css'
import { FieldGrid, TextRow } from './layout'
import type { FlagInfo, FormViewProps } from './types'
import { useLocalize } from './useLocalize'

// Computed values are recalculated from the answers, never read from what was stored.
export function FormView({ definition, answers: storedAnswers, context, flags = [], onFlag, layout = 'tabs', compareTo }: FormViewProps) {
  const l = useLocalize()
  const config = useDhiforms()
  if (context.ready === false) return <Loader size="sm" />
  const today = config.today(context.now ? new Date(context.now) : new Date())
  const answers = computeValues(definition, storedAnswers, today, context.lookups)
  const previous = compareTo ? computeValues(definition, compareTo, today, context.lookups) : undefined
  const pages = visiblePages(definition, answers, context.lookups)
  const env: ViewEnv = { answers, context, flags, onFlag, compareTo: previous }
  const openFlagsOnPage = (page: Page) => visibleFields(page, answers, context.lookups).filter(({ path }) => flags.some((flag) => flag.fieldPath === path && flag.status === 'open')).length
  const changedOnPage = (page: Page) => (previous ? visibleFields(page, answers, context.lookups).filter(({ field, path }) => hasChanged(field, path, answers, previous)).length : 0)

  if (layout === 'stacked') {
    return (
      <div className={classes.view}>
        {pages.map((page) => (
          <section key={page.key} className={classes.viewSection} aria-labelledby={`view-${page.key}`}>
            <Title order={3} id={`view-${page.key}`}>{l(page.title)}</Title>
            {page.description && <Text c="dimmed" size="sm">{l(page.description)}</Text>}
            <ViewPage page={page} env={env} />
          </section>
        ))}
      </div>
    )
  }

  return (
    <Tabs defaultValue={pages[0]?.key} keepMounted={false} variant="pills" radius="sm" className={classes.view} classNames={{ tab: classes.pageTab }}>
      <Tabs.List className={classes.tabList}>
        {pages.map((page) => {
          const openCount = openFlagsOnPage(page)
          const changedCount = changedOnPage(page)
          const badge = openCount > 0 ? { color: 'yellow', count: openCount, name: 'open flags' } : changedCount > 0 ? { color: 'blue', count: changedCount, name: 'changed fields' } : null
          return (
            <Tabs.Tab
              key={page.key}
              value={page.key}
              rightSection={badge && <Badge size="sm" color={badge.color} circle aria-label={`${badge.count} ${badge.name}`}>{badge.count}</Badge>}
            >
              {l(page.title)}
            </Tabs.Tab>
          )
        })}
      </Tabs.List>
      {pages.map((page) => (
        <Tabs.Panel key={page.key} value={page.key} className={classes.tabPanel}>
          {page.description && <Text c="dimmed" size="sm">{l(page.description)}</Text>}
          <ViewPage page={page} env={env} />
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}

const sameAnswer = (current: unknown, previous: unknown) => JSON.stringify(current ?? null) === JSON.stringify(previous ?? null)

type ViewEnv = { answers: Answers; context: FormViewProps['context']; flags: FlagInfo[]; onFlag?: FormViewProps['onFlag']; compareTo?: Answers }

function hasChanged(field: Field, path: string, answers: Answers, compareTo: Answers) {
  if (field.type === 'lookup' || field.type === 'computed') return false
  return !sameAnswer(getAnswer(answers, path), getAnswer(compareTo, path))
}

function ViewPage({ page, env }: { page: Page; env: ViewEnv }) {
  return (
    <div className={classes.rows}>
      {visibleRows(page, env.answers, env.context.lookups).map((row, rowIndex) => (
        <ViewRow key={row.id ?? rowIndex} row={row} env={env} />
      ))}
    </div>
  )
}

function ViewRow({ row, env }: { row: Row; env: ViewEnv }) {
  const l = useLocalize()
  const { answers, context } = env
  if (row.type === 'fields') {
    const fields = row.fields.filter((field) => evaluateCondition(field.showIf, { answers, lookups: context.lookups }))
    return <FieldGrid fields={fields}>{(field) => <ViewField field={field} path={field.key} env={env} />}</FieldGrid>
  }

  if (row.type !== 'repeated') return <TextRow row={row} quiet />

  const items = repeatedItems(row, answers)
  const itemLabel = l(row.itemLabel) || 'Item'
  return (
    <div className={classes.repeated}>
      {row.label && <Text fw={600} size="sm">{l(row.label)}</Text>}
      {items.length === 0 && <Text c="dimmed" size="sm">No {itemLabel.toLowerCase()} added.</Text>}
      {items.map((values, index) => {
        const item = itemScope(row, index, values)
        const fields = row.fields.filter((field) => evaluateCondition(field.showIf, { answers, lookups: context.lookups, item }))
        return (
          <div key={index} className={classes.item} role="group" aria-label={`${itemLabel} ${index + 1}`}>
            <Text fw={500} size="sm" className={classes.itemHeader}>{itemLabel} {index + 1}</Text>
            <FieldGrid fields={fields}>
              {(field) => <ViewField field={field} path={fieldPath(field.key, row.key, index)} item={values} env={env} />}
            </FieldGrid>
          </div>
        )
      })}
    </div>
  )
}

function ViewField({ field, path, item, env }: { field: Field; path: string; item?: Answers; env: ViewEnv }) {
  const l = useLocalize()
  const language = useLabelLanguage()
  const { currency } = useDhiforms()
  const label = l(field.label)
  const { context, flags, compareTo } = env
  const onFlag = field.type === 'computed' ? undefined : env.onFlag
  const value = ownValue(item ?? env.answers, field.key)
  const fieldFlags: FlagInfo[] = flags.filter((flag: FlagInfo) => flag.fieldPath === path)
  const hasOpenFlag = fieldFlags.some((flag) => flag.status === 'open')
  const changed = compareTo && hasChanged(field, path, env.answers, compareTo)
  const previous = compareTo ? getAnswer(compareTo, path) : undefined

  return (
    <div className={classes.viewField} data-flagged={hasOpenFlag || undefined} data-changed={changed || undefined}>
      <div className={classes.viewLabelRow}>
        <Text className={classes.viewLabel}>{label}</Text>
        {changed && <Badge size="sm" color="blue" variant="light">Changed</Badge>}
        {onFlag && (
          <ActionIcon variant="subtle" color="gray" size="sm" className={classes.flagButton} aria-label={`Flag ${label}`} onClick={() => onFlag(path, label)}>
            <IconFlag size={15} />
          </ActionIcon>
        )}
      </div>

      <AnswerValue field={field} value={value} context={context} lookup={context.lookups[path]} />
      {changed && <Text size="sm" c="dimmed" className={classes.previous}>Before: <s>{answerText(field, previous, context, language, currency)}</s></Text>}

      {fieldFlags.map((flag) => (
        <p key={flag.remarks} className={classes.flagRemarks} data-status={flag.status}>
          <IconFlag size={14} aria-hidden />
          <span>
            <Text span fw={500} size="sm">{flag.status === 'open' ? 'Flagged' : 'Resolved'}: </Text>
            {flag.remarks}
          </span>
        </p>
      ))}
    </div>
  )
}
