import { conditionNames, localize, type Condition, type ConditionName, type FieldCondition, type FormDefinition, type OwnFieldCondition } from '../core'
import { ActionIcon, Button, MultiSelect, NumberInput, SegmentedControl, Select, TagsInput, Text, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { t, useT } from '../react/labels'
import { useDhiforms, type ConnectorInfo } from '../react/config'
import { allFields, conditionLabels, fieldOptions, lookupStatusLabels, matchLabels, type FieldChoice, type FormLists } from './model'
import { useDesigner } from './store'
import classes from './designer.module.css'

type Match = 'any' | 'all' | 'none'
type Rule = { path: string; condition: ConditionName; value: any; match?: Match }

// One thing a rule can test: a field's value, a lookup's check result, or one of the lookup's outputs.
type Target = { value: string; label: string; page: string; choice: FieldChoice; reads: 'value' | 'status' | 'output'; needsMatch: boolean }

const numericConditions: ConditionName[] = ['greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual']
const statusConditions: ConditionName[] = ['equals', 'notEquals', 'in', 'notIn']
const needsValue = (condition: ConditionName) => condition !== 'isEmpty' && condition !== 'isNotEmpty'
const isList = (condition: ConditionName) => condition === 'in' || condition === 'notIn'

// Fields in the repeated group being edited are read from the same item, so they need no group prefix; fields in another group need a match.
function buildTargets(definition: FormDefinition, connectors: ConnectorInfo[], scopeRowKey: string | undefined, restrictToRow: boolean): Target[] {
  return allFields(definition).flatMap((choice) => {
    const group = choice.repeated
    if (restrictToRow && group?.key !== scopeRowKey) return []
    const needsMatch = group !== undefined && group.key !== scopeRowKey
    const base = needsMatch ? `${group.key}.${choice.field.key}` : choice.field.key
    const inGroup = (label: string) => (needsMatch ? t('designer.inGroup', { label, group: localize(group.label) || group.key }) : label)
    const targets: Target[] = [{ value: base, label: inGroup(localize(choice.field.label)), page: choice.page, choice, reads: 'value', needsMatch }]
    if (choice.field.type === 'lookup') {
      targets.push({ value: `${base}.status`, label: inGroup(t('designer.checkResultOf', { label: localize(choice.field.label) })), page: choice.page, choice, reads: 'status', needsMatch })
      const connector = connectors.find((item) => item.key === choice.field.connector)
      connector?.outputs.forEach((output) => targets.push({ value: `${base}.data.${output.key}`, label: inGroup(`${localize(choice.field.label)}: ${output.label}`), page: choice.page, choice, reads: 'output', needsMatch }))
    }
    return targets
  })
}

function conditionChoices(target: Target | undefined) {
  const type = target?.choice.field.type
  const numeric = target?.reads === 'output' || type === 'number' || type === 'amount' || type === 'computed' || type === 'date'
  const names = target?.reads === 'status' ? statusConditions : conditionNames.filter((name) => numeric || !numericConditions.includes(name))
  return names.map((name) => ({ value: name, label: conditionLabels[name] }))
}

function toRule(condition: any, ownKey?: string): Rule | null {
  if ('all' in condition || 'any' in condition || 'not' in condition) return null
  const path = condition.field ?? ownKey
  if (path === undefined || condition.condition === undefined) return null
  return { path, condition: condition.condition, value: condition.value, match: condition.match }
}

// Reads a condition into mode and rules, or null when it is nested deeper than this builder edits.
function parse(condition: any, ownKey?: string): { mode: 'all' | 'any'; rules: Rule[] } | null {
  if (!condition || Object.keys(condition).length === 0) return { mode: 'all', rules: [] }
  const mode = 'any' in condition ? 'any' : 'all'
  const parts: any[] = 'all' in condition ? condition.all : 'any' in condition ? condition.any : [condition]
  const rules = parts.map((part) => toRule(part, ownKey))
  if (rules.some((rule) => rule === null)) return null
  return { mode, rules: rules as Rule[] }
}

function toLeaf(rule: Rule): FieldCondition {
  const leaf: FieldCondition = { field: rule.path, condition: rule.condition }
  if (needsValue(rule.condition)) leaf.value = rule.value
  if (rule.match) leaf.match = rule.match
  return leaf
}

function emit(mode: 'all' | 'any', rules: Rule[], ownKey?: string): Condition | OwnFieldCondition | null {
  if (rules.length === 0) return null
  const leaves = rules.map(toLeaf)
  if (leaves.length > 1) return { [mode]: leaves } as Condition
  const [only] = leaves
  // A message's own-field rule is stored without the field, as the renderer expects.
  if (ownKey !== undefined && only.field === ownKey && !only.match) {
    const { field, match, ...rest } = only
    return rest
  }
  return only
}

function ValueInput({ rule, target, lists, onChange }: { rule: Rule; target: Target | undefined; lists: FormLists; onChange: (value: any) => void }) {
  const t = useT()
  if (!needsValue(rule.condition)) return <Text size="sm" c="dimmed">{t('designer.noValueNeeded')}</Text>
  const statusOptions = Object.entries(lookupStatusLabels).map(([value, label]) => ({ value, label }))
  const options = target?.reads === 'status' ? statusOptions : target?.reads === 'value' ? fieldOptions(target.choice.field, lists) : []
  const isCheckbox = target?.reads === 'value' && target.choice.field.type === 'checkbox'
  const type = target?.choice.field.type
  const isNumeric = numericConditions.includes(rule.condition) || (target?.reads === 'value' && (type === 'number' || type === 'amount' || type === 'computed'))

  if (isList(rule.condition)) {
    const values = (Array.isArray(rule.value) ? rule.value : []).map(String)
    if (options.length === 0) return <TagsInput aria-label={t('designer.valuesAria')} placeholder={t('designer.typeValuePlaceholder')} value={values} onChange={onChange} />
    return <MultiSelect aria-label={t('designer.valuesAria')} placeholder={t('designer.chooseValues')} data={options} value={values} onChange={onChange} />
  }
  if (isNumeric) return <NumberInput aria-label={t('designer.valueAria')} value={rule.value ?? ''} onChange={(next) => onChange(next === '' ? undefined : Number(next))} />
  if (options.length > 0) {
    const shown = isCheckbox ? (rule.value === undefined ? null : String(rule.value)) : (rule.value ?? null)
    return <Select aria-label={t('designer.valueAria')} placeholder={t('designer.chooseValue')} data={options} value={shown} onChange={(next) => onChange(isCheckbox ? next === 'true' : next)} />
  }
  return <TextInput aria-label={t('designer.valueAria')} value={rule.value ?? ''} onChange={(event) => onChange(event.currentTarget.value)} />
}

type ConditionBuilderProps = {
  value: Condition | OwnFieldCondition | null | undefined
  onChange: (next: any) => void
  lists: FormLists
  emptyText: string
  // Field messages: an own-field rule is stored without a field.
  ownKey?: string
  // Set when the condition belongs to a field inside this repeated group, so the group's fields read from the same item.
  scopeRowKey?: string
  // COUNT's `where`: one rule on a field of the scoped group.
  single?: boolean
}

// Builds a showIf, message or COUNT condition: rules combined with all or any.
export function ConditionBuilder({ value, onChange, lists, ownKey, emptyText, scopeRowKey, single = false }: ConditionBuilderProps) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const { connectors = [] } = useDhiforms()
  const targets = buildTargets(definition, connectors, scopeRowKey, single)
  const parsed = parse(value, ownKey)

  if (!parsed || (single && parsed.rules.length > 1)) {
    return (
      <div className={classes.conditionBox}>
        <Text size="sm">{t('designer.nestedText')}</Text>
        <pre className={classes.conditionJson}>{JSON.stringify(value, null, 2)}</pre>
        <Button variant="default" size="xs" onClick={() => onChange(null)}>{t('designer.replaceSimple')}</Button>
      </div>
    )
  }

  const { mode, rules } = parsed
  const groups = [...new Set(targets.map((target) => target.page))].map((page) => ({ group: page, items: targets.filter((target) => target.page === page).map(({ value, label }) => ({ value, label })) }))
  const targetFor = (path: string) => targets.find((target) => target.value === path)

  const change = (nextRules: Rule[], nextMode = mode) => onChange(emit(nextMode, nextRules, ownKey))
  const updateRule = (index: number, patch: Partial<Rule>) => change(rules.map((rule, at) => (at === index ? { ...rule, ...patch } : rule)))

  const changeTarget = (index: number, path: string) => {
    const target = targetFor(path)
    const allowed = conditionChoices(target).map((choice) => choice.value)
    const condition = allowed.includes(rules[index].condition) ? rules[index].condition : 'equals'
    updateRule(index, { path, condition, value: isList(condition) ? [] : undefined, match: target?.needsMatch ? (rules[index].match ?? 'any') : undefined })
  }

  const addRule = () => {
    const path = ownKey ?? targets[0]?.value ?? ''
    const target = targetFor(path)
    const first = target?.reads === 'value' ? fieldOptions(target.choice.field, lists)[0] : undefined
    change([...rules, { path, condition: 'equals', value: first ? first.value : undefined, match: target?.needsMatch ? 'any' : undefined }])
  }

  const noTargets = targets.length === 0

  return (
    <div className={classes.conditionBox}>
      {rules.length === 0 && <Text size="sm" c="dimmed">{emptyText}</Text>}

      {rules.length > 1 && (
        <div className={classes.modeLine}>
          <Text size="sm">{t('designer.appliesWhen')}</Text>
          <SegmentedControl size="xs" aria-label={t('designer.combineAria')} value={mode} onChange={(next) => change(rules, next as 'all' | 'any')} data={[{ value: 'all', label: t('designer.modeAll') }, { value: 'any', label: t('designer.modeAny') }]} />
        </div>
      )}

      {rules.map((rule, index) => {
        const target = targetFor(rule.path)
        const itemName = localize(target?.choice.repeated?.itemLabel).toLowerCase() || t('designer.item')
        return (
          <div key={index} className={classes.rule}>
            {target?.needsMatch && (
              <Select
                aria-label={t('designer.whichItems')}
                allowDeselect={false}
                data={(Object.keys(matchLabels) as Match[]).map((match) => ({ value: match, label: t('designer.whenMatch', { match: matchLabels[match], item: itemName }) }))}
                value={rule.match ?? 'any'}
                onChange={(next) => updateRule(index, { match: next as Match })}
              />
            )}
            <Select aria-label={t('designer.field')} searchable placeholder={t('designer.chooseField')} data={groups} value={target ? rule.path : null} onChange={(next) => changeTarget(index, next ?? '')} />
            <div className={classes.ruleLine}>
              <Select aria-label={t('designer.conditionAria')} allowDeselect={false} data={conditionChoices(target)} value={rule.condition} onChange={(next) => updateRule(index, { condition: next as ConditionName, value: isList(next as ConditionName) ? [] : undefined })} />
              <ValueInput rule={rule} target={target} lists={lists} onChange={(next) => updateRule(index, { value: next })} />
              <ActionIcon variant="subtle" color="gray" aria-label={t('designer.removeRule')} onClick={() => change(rules.filter((_, at) => at !== index))}>
                <IconTrash size={16} />
              </ActionIcon>
            </div>
            {!target && rule.path !== '' && <Text size="xs" c="red">{t('designer.notAField', { path: rule.path })}</Text>}
          </div>
        )
      })}

      {!(single && rules.length > 0) && (
        <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={addRule} disabled={noTargets}>
          {rules.length === 0 ? t('designer.addARule') : t('designer.addAnotherRule')}
        </Button>
      )}
      {noTargets && <Text size="xs" c="dimmed">{single ? t('designer.countNeedsFields') : t('designer.rulesNeedFields')}</Text>}
    </div>
  )
}
