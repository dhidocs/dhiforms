import {
  assignIds,
  conditionFieldKeys,
  fieldTypes,
  formulaCycle,
  formulaFns,
  localize,
  newId,
  type Condition,
  type ConditionName,
  type Field,
  type FieldType,
  type FormDefinition,
  type Formula,
  type FormulaFn,
  type OwnFieldCondition,
  type Row,
  type RowType,
} from '../core'
import {
  IconAlignJustified,
  IconAlignLeft,
  IconCalculator,
  IconCalendar,
  IconCircleDot,
  IconCoin,
  IconColumns,
  IconH1,
  IconH2,
  IconId,
  IconListCheck,
  IconMail,
  IconNumber,
  IconPaperclip,
  IconPhone,
  IconPlugConnected,
  IconRepeat,
  IconSelector,
  IconSeparatorHorizontal,
  IconSquareCheck,
  IconTextSize,
} from '@tabler/icons-react'
import type { LabelKey } from '../react/labels'
import { t } from '../react/labels'
import type { ConnectorInfo } from '../react/config'

export type Selection = { kind: 'page' } | { kind: 'row'; row: number } | { kind: 'field'; row: number; field: number }

export type FormLists = Record<string, { value: string; label: string; meta?: Record<string, any> }[]>

// The label is read through t() on every access, so edited UI labels show without reloading the designer.
const typeEntry = (labelKey: LabelKey, icon: any) => ({ get label() { return t(labelKey) }, icon })

// A record whose values are UI labels, looked up on every read.
function labelRecord<K extends string>(keys: Record<K, LabelKey>): Record<K, string> {
  const record = {} as Record<K, string>
  for (const name of Object.keys(keys) as K[]) Object.defineProperty(record, name, { get: () => t(keys[name]), enumerable: true })
  return record
}

export const fieldTypeInfo: Record<FieldType, { label: string; icon: any }> = {
  text: typeEntry('designer.typeShortText', IconTextSize),
  textarea: typeEntry('designer.typeLongText', IconAlignLeft),
  number: typeEntry('designer.typeNumber', IconNumber),
  amount: typeEntry('designer.typeAmount', IconCoin),
  date: typeEntry('designer.typeDate', IconCalendar),
  radio: typeEntry('designer.typeRadio', IconCircleDot),
  select: typeEntry('designer.typeDropdown', IconSelector),
  checkbox: typeEntry('designer.typeCheckbox', IconSquareCheck),
  checkboxGroup: typeEntry('designer.typeMultipleChoice', IconListCheck),
  nid: typeEntry('designer.typeNationalId', IconId),
  phone: typeEntry('designer.typePhone', IconPhone),
  email: typeEntry('designer.typeEmail', IconMail),
  file: typeEntry('designer.typeFile', IconPaperclip),
  lookup: typeEntry('designer.typeLookup', IconPlugConnected),
  computed: typeEntry('designer.typeComputed', IconCalculator),
}

export const rowTypeInfo: Record<RowType, { label: string; icon: any }> = {
  fields: typeEntry('designer.rowFields', IconColumns),
  heading: typeEntry('designer.rowHeading', IconH1),
  subheading: typeEntry('designer.rowSubheading', IconH2),
  paragraph: typeEntry('designer.rowParagraph', IconAlignJustified),
  break: typeEntry('designer.rowBreak', IconSeparatorHorizontal),
  repeated: typeEntry('designer.rowRepeated', IconRepeat),
}

export const rowTypes = Object.keys(rowTypeInfo) as RowType[]
export { fieldTypes }

export const hasOptions = (type: FieldType) => type === 'radio' || type === 'select' || type === 'checkboxGroup'
export const isFieldsRow = (row: Row | undefined): row is Extract<Row, { fields: Field[] }> => row?.type === 'fields' || row?.type === 'repeated'

const camelCase = /^[a-z][a-zA-Z0-9]*$/
export const isCamelCase = (key: string) => camelCase.test(key)

type KeyOwner = { key: string; page: number; row: number; field: number | null }

// Every key that must be unique in the form: field keys and repeated group keys.
export function collectKeys(definition: FormDefinition): KeyOwner[] {
  const owners: KeyOwner[] = []
  definition.pages.forEach((page, pageIndex) => {
    page.rows.forEach((row, rowIndex) => {
      if (row.type === 'repeated') owners.push({ key: row.key, page: pageIndex, row: rowIndex, field: null })
      if (isFieldsRow(row)) row.fields.forEach((field, fieldIndex) => owners.push({ key: field.key, page: pageIndex, row: rowIndex, field: fieldIndex }))
    })
  })
  return owners
}

export function uniqueKey(definition: FormDefinition, base: string) {
  const taken = new Set(collectKeys(definition).map((owner) => owner.key))
  let counter = 1
  while (taken.has(`${base}${counter}`)) counter++
  return `${base}${counter}`
}

// The message to show beside a key input, or null when the key is fine.
export function keyProblem(definition: FormDefinition, key: string, own: { page: number; row: number; field: number | null }) {
  if (key === '') return t('designer.keyEmpty')
  if (!isCamelCase(key)) return t('designer.fieldKeyInvalid', { key })
  const clash = collectKeys(definition).find((owner) => owner.key === key && !(owner.page === own.page && owner.row === own.row && owner.field === own.field))
  if (clash) return t('designer.fieldKeyTaken', { key, page: localize(definition.pages[clash.page].title) || definition.pages[clash.page].key })
  return null
}

export function newField(definition: FormDefinition, type: FieldType): Field {
  const field: Field = { id: newId('f'), key: uniqueKey(definition, type), type, label: fieldTypeInfo[type].label }
  if (hasOptions(type)) {
    field.options = [
      { value: 'option1', label: t('designer.defaultOption', { number: 1 }) },
      { value: 'option2', label: t('designer.defaultOption', { number: 2 }) },
    ]
  }
  if (type === 'file') field.file = { accept: ['application/pdf', 'image/jpeg', 'image/png'], maxSizeMb: 5, maxFiles: 1 }
  if (type === 'lookup') field.inputs = {}
  if (type === 'computed') Object.assign(field, { formula: { fn: 'SUM', args: [] }, format: 'number' })
  return field
}

export function newRow(definition: FormDefinition, type: RowType): Row {
  const id = newId('r')
  if (type === 'fields') return { id, type, fields: [] }
  if (type === 'repeated') return { id, type, key: uniqueKey(definition, 'group'), label: t('designer.defaultGroupLabel'), itemLabel: t('designer.defaultItemLabel'), repeatType: 'add', minRepeats: 0, maxRepeats: 4, fields: [] }
  if (type === 'break') return { id, type }
  return { id, type, text: rowTypeInfo[type].label }
}

export function newDefinition(key: string, title: string): FormDefinition {
  return assignIds({ key, version: 1, title, pages: [{ id: newId('p'), key: 'page1', title: t('designer.pageNumber', { number: 1 }), rows: [{ id: newId('r'), type: 'fields', fields: [] }] }] })
}

// Same rule as the renderer: fields with a width take that many of 12 columns, the rest share what is left.
export function columnSpan(field: Field, siblings: Field[]) {
  if (field.width) return Math.min(12, field.width)
  const fixed = siblings.reduce((sum, sibling) => sum + (sibling.width ?? 0), 0)
  const flexible = siblings.filter((sibling) => !sibling.width).length
  const remaining = 12 - fixed
  return remaining > 0 ? Math.max(1, Math.floor(remaining / flexible)) : Math.floor(12 / siblings.length)
}

// `repeated` is set for fields inside a repeated group: their answers live per item under the group's key.
export type FieldChoice = { value: string; label: string; page: string; field: Field; repeated?: Extract<Row, { type: 'repeated' }> }

export function allFields(definition: FormDefinition): FieldChoice[] {
  return definition.pages.flatMap((page) =>
    page.rows.flatMap((row) =>
      isFieldsRow(row)
        ? row.fields.map((field) => ({ value: field.key, label: `${localize(field.label)} (${field.key})`, page: localize(page.title) || page.key, field, repeated: row.type === 'repeated' ? row : undefined }))
        : [],
    ),
  )
}

export const conditionLabels = labelRecord<ConditionName>({
  equals: 'designer.condEquals',
  notEquals: 'designer.condNotEquals',
  in: 'designer.condIn',
  notIn: 'designer.condNotIn',
  greaterThan: 'designer.condGreaterThan',
  lessThan: 'designer.condLessThan',
  greaterThanOrEqual: 'designer.condAtLeast',
  lessThanOrEqual: 'designer.condAtMost',
  isEmpty: 'designer.condEmpty',
  isNotEmpty: 'designer.condNotEmpty',
})

export const lookupStatusLabels = labelRecord({ found: 'designer.lookupFound', not_found: 'designer.lookupNotFound', error: 'designer.lookupError', pending: 'designer.lookupPending' })

export const matchLabels = labelRecord({ any: 'designer.matchAny', all: 'designer.matchAll', none: 'designer.matchNone' })

// "coApplicants.disability.status" → the disability field in the coApplicants group, reading the lookup's status.
export function readTarget(path: string, definition: FormDefinition) {
  const segments = path.split('.')
  const choices = allFields(definition)
  const groupFirst = segments.length > 1 && choices.some((choice) => choice.repeated?.key === segments[0])
  const [rowKey, rest] = groupFirst ? [segments[0], segments.slice(1)] : [undefined, segments]
  const choice = choices.find((candidate) => candidate.value === rest[0] && (rowKey === undefined || candidate.repeated?.key === rowKey))
  const reads = rest[1] === 'status' ? 'status' : rest[1] === 'data' ? 'output' : 'value'
  return { rowKey, choice, reads: reads as 'status' | 'output' | 'value', output: rest[2] }
}

function targetName(path: string, definition: FormDefinition) {
  const { choice, reads, output } = readTarget(path, definition)
  const name = choice ? localize(choice.field.label) : path
  if (reads === 'status') return t('designer.describeCheckResult', { name })
  if (reads === 'output') return `${name} ${output}`
  return name
}

function valueText(path: string, value: unknown, definition: FormDefinition) {
  const { choice, reads } = readTarget(path, definition)
  const one = (entry: unknown) => (reads === 'status' ? (lookupStatusLabels[entry as keyof typeof lookupStatusLabels] ?? String(entry)) : (localize(choice?.field.options?.find((option) => option.value === entry)?.label) || String(entry)))
  return Array.isArray(value) ? value.map(one).join(` ${t('designer.joinOr')} `) : one(value)
}

// Plain-language summary of a condition for the "Shown when" markers.
export function describeCondition(condition: Condition | OwnFieldCondition | null | undefined, definition: FormDefinition, ownKey?: string): string {
  if (!condition) return ''
  if ('all' in condition) return condition.all.map((part) => describeCondition(part, definition, ownKey)).join(` ${t('designer.joinAnd')} `)
  if ('any' in condition) return condition.any.map((part) => describeCondition(part, definition, ownKey)).join(` ${t('designer.joinOr')} `)
  if ('not' in condition) return t('designer.describeNot', { condition: describeCondition(condition.not, definition, ownKey) })
  const path = 'field' in condition ? condition.field : (ownKey ?? t('designer.thisField'))
  const needsValue = condition.condition !== 'isEmpty' && condition.condition !== 'isNotEmpty'
  const rest = `${targetName(path, definition)} ${conditionLabels[condition.condition] ?? condition.condition}${needsValue ? ` ${valueText(path, condition.value, definition)}` : ''}`
  if (!('match' in condition) || !condition.match) return rest
  const item = localize(readTarget(path, definition).choice?.repeated?.itemLabel).toLowerCase() || t('designer.item')
  return t('designer.describeQuantified', { match: matchLabels[condition.match], item, rest })
}

const formulaEntry = (labelKey: LabelKey, arity: [number, number]) => ({ get label() { return t(labelKey) }, arity })

export const formulaInfo: Record<FormulaFn, { label: string; arity: [number, number] }> = {
  SUM: formulaEntry('designer.formulaSum', [1, 20]),
  DIFFERENCE: formulaEntry('designer.formulaDifference', [2, 20]),
  PRODUCT: formulaEntry('designer.formulaProduct', [2, 20]),
  DIVIDE: formulaEntry('designer.formulaDivide', [2, 2]),
  COUNT: formulaEntry('designer.formulaCount', [1, 1]),
  AGE: formulaEntry('designer.formulaAge', [1, 1]),
  DAYS_BETWEEN: formulaEntry('designer.formulaDaysBetween', [2, 2]),
}

export { formulaFns }

export const describeFormula = (formula: Formula | undefined) => (formula ? `${formula.fn}(${formula.args.join(', ')})${formula.where ? ' where …' : ''}` : '')

function formulaProblems(field: Field, definition: FormDefinition): string[] {
  const formula = field.formula
  const name = t('designer.computedName', { key: field.key })
  if (!formula) return [t('designer.formulaMissing', { name })]
  const [fewest, most] = formulaInfo[formula.fn]?.arity ?? [1, 20]
  const problems: string[] = []
  if (formula.args.length < fewest || formula.args.length > most) {
    const exact = fewest === 1 ? t('designer.formulaExactOne', { name, fn: formula.fn }) : t('designer.formulaExact', { name, fn: formula.fn, count: fewest })
    problems.push(fewest === most ? exact : t('designer.formulaAtLeast', { name, fn: formula.fn, count: fewest }))
  }
  const choices = allFields(definition)
  const groups = choices.flatMap((choice) => (choice.repeated ? [choice.repeated.key] : []))
  formula.args.forEach((arg) => {
    if (typeof arg === 'number') return
    if (arg === '') return problems.push(t('designer.formulaEmptyArg', { name }))
    const [head, column] = arg.split('.')
    if (formula.fn === 'COUNT' && column === undefined) {
      if (!groups.includes(head)) problems.push(t('designer.formulaCountNeedsGroup', { name, arg }))
      return
    }
    if (column !== undefined) {
      if (formula.fn !== 'SUM' && formula.fn !== 'COUNT') problems.push(t('designer.formulaColumnOnlySum', { name, arg }))
      if (!choices.some((choice) => choice.repeated?.key === head && choice.value === column)) problems.push(t('designer.formulaNotGroupColumn', { name, arg }))
      return
    }
    if (!choices.some((choice) => choice.value === head)) problems.push(t('designer.formulaNotField', { name, arg }))
  })
  return problems
}

export function fieldOptions(field: Field | undefined, lists: FormLists) {
  if (!field) return []
  if (field.type === 'checkbox') return [{ value: 'true', label: t('designer.ticked') }, { value: 'false', label: t('designer.notTicked') }]
  return field.options?.map(({ value, label }) => ({ value, label: localize(label) })) ?? (field.optionsFrom ? (lists[field.optionsFrom] ?? []).map(({ value, label }) => ({ value, label })) : [])
}

export type Issue = { message: string; page: number; selection: Selection }

// Problems that block publishing. Saving a draft is allowed with problems so work is never lost.
export function findIssues(definition: FormDefinition, connectors: ConnectorInfo[]): Issue[] {
  const issues: Issue[] = []
  const pageName = (index: number) => localize(definition.pages[index].title) || definition.pages[index].key
  const knownKeys = new Set(collectKeys(definition).map((owner) => owner.key))
  const checkCondition = (condition: Condition | OwnFieldCondition | null | undefined, where: Omit<Issue, 'message'>, what: string) => {
    for (const key of conditionFieldKeys(condition)) {
      if (!knownKeys.has(key)) issues.push({ ...where, message: t('designer.issueMissingField', { what, page: pageName(where.page), key }) })
    }
  }

  if (localize(definition.title).trim() === '') issues.push({ message: t('designer.issueNoTitle'), page: 0, selection: { kind: 'page' } })
  if (definition.pages.length === 0) issues.push({ message: t('designer.issueNoPages'), page: 0, selection: { kind: 'page' } })

  definition.pages.forEach((page, pageIndex) => {
    const pageSelection: Selection = { kind: 'page' }
    if (!isCamelCase(page.key)) issues.push({ message: t('designer.issuePageKey', { key: page.key }), page: pageIndex, selection: pageSelection })
    if (definition.pages.findIndex((other) => other.key === page.key) !== pageIndex) issues.push({ message: t('designer.issuePageKeyTwice', { key: page.key }), page: pageIndex, selection: pageSelection })
    if (localize(page.title).trim() === '') issues.push({ message: t('designer.issuePageNoTitle', { number: pageIndex + 1 }), page: pageIndex, selection: pageSelection })
    checkCondition(page.showIf, { page: pageIndex, selection: pageSelection }, t('designer.issuePageCondition'))

    page.rows.forEach((row, rowIndex) => {
      const rowSelection: Selection = { kind: 'row', row: rowIndex }
      checkCondition(row.showIf, { page: pageIndex, selection: rowSelection }, t('designer.issueRowCondition'))
      if ((row.type === 'heading' || row.type === 'subheading' || row.type === 'paragraph') && localize(row.text).trim() === '') {
        issues.push({ message: t('designer.issueRowNoText', { row: rowTypeInfo[row.type].label.toLowerCase(), page: pageName(pageIndex) }), page: pageIndex, selection: rowSelection })
      }
      if (row.type === 'repeated') {
        const problem = keyProblem(definition, row.key, { page: pageIndex, row: rowIndex, field: null })
        if (problem) issues.push({ message: t('designer.issueRepeated', { problem }), page: pageIndex, selection: rowSelection })
      }
      if (!isFieldsRow(row)) return

      row.fields.forEach((field, fieldIndex) => {
        const selection: Selection = { kind: 'field', row: rowIndex, field: fieldIndex }
        const where = { page: pageIndex, selection }
        const problem = keyProblem(definition, field.key, { page: pageIndex, row: rowIndex, field: fieldIndex })
        if (problem) issues.push({ message: problem, ...where })
        const named = { key: field.key, page: pageName(pageIndex) }
        if (localize(field.label).trim() === '') issues.push({ message: t('designer.issueNoLabel', named), ...where })
        if (hasOptions(field.type) && !field.optionsFrom && (field.options ?? []).length === 0) {
          issues.push({ message: t('designer.issueNoOptions', named), ...where })
        }
        if (field.type === 'lookup') {
          const connector = connectors.find((item) => item.key === field.connector)
          if (!connector) issues.push({ message: t('designer.issueNoConnector', named), ...where })
          else {
            for (const input of connector.inputs) {
              if (!field.inputs?.[input.key]) issues.push({ message: t('designer.issueInputUnmapped', { ...named, input: input.label }), ...where })
            }
          }
        }
        checkCondition(field.showIf, where, t('designer.issueFieldCondition', { key: field.key }))
        field.messages?.forEach((message) => {
          if (localize(message.text).trim() === '') issues.push({ message: t('designer.issueMessageNoText', { key: field.key }), ...where })
          checkCondition(message.when, where, t('designer.issueMessageCondition', { key: field.key }))
        })
        if (field.type === 'computed') formulaProblems(field, definition).forEach((message) => issues.push({ message, ...where }))
        field.businessRules?.forEach((rule) => {
          if (rule.description.trim() === '') issues.push({ message: t('designer.issueRuleNoText', { key: field.key }), ...where })
        })
      })
    })
  })

  const cycle = formulaCycle(definition)
  if (cycle) {
    const owner = collectKeys(definition).find((candidate) => candidate.key === cycle[0])
    if (owner && owner.field !== null) {
      issues.push({ message: t('designer.issueFormulaLoop', { keys: cycle.join(', ') }), page: owner.page, selection: { kind: 'field', row: owner.row, field: owner.field } })
    }
  }
  return issues
}

// Definition text is a string or { en, dv? } (packages/forms Text).
const isText = (value: any) => typeof value === 'string' || (typeof value?.en === 'string' && (value.dv === undefined || typeof value.dv === 'string'))

// Shape check for pasted JSON. Returns one specific message per problem found.
export function checkDefinitionShape(value: any): string[] {
  const errors: string[] = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [t('designer.jsonNotObject')]
  if (!isText(value.title)) errors.push(t('designer.jsonRootText', { prop: 'title' }))
  if (!Array.isArray(value.pages)) return [...errors, t('designer.jsonPagesList')]
  if (value.pages.length === 0) errors.push(t('designer.jsonPagesEmpty'))
  const mustBeText = (at: string, prop: string) => t('designer.jsonMustBeText', { at, prop })

  value.pages.forEach((page: any, pageIndex: number) => {
    const at = `pages[${pageIndex}]`
    if (typeof page?.key !== 'string') errors.push(mustBeText(at, 'key'))
    if (!isText(page?.title)) errors.push(mustBeText(at, 'title'))
    if (!Array.isArray(page?.rows)) return errors.push(t('designer.jsonMustBeList', { at, prop: 'rows' }))
    page.rows.forEach((row: any, rowIndex: number) => {
      const rowAt = `${at}.rows[${rowIndex}]`
      if (!rowTypes.includes(row?.type)) return errors.push(t('designer.jsonRowType', { at: rowAt, type: String(row?.type), types: rowTypes.join(', ') }))
      if (['heading', 'subheading', 'paragraph'].includes(row.type) && !isText(row.text)) errors.push(mustBeText(rowAt, 'text'))
      if (row.type === 'repeated') {
        if (typeof row.key !== 'string') errors.push(mustBeText(rowAt, 'key'))
        if (row.repeatType !== 'fixed' && row.repeatType !== 'add') errors.push(t('designer.jsonRepeatType', { at: rowAt }))
      }
      if (row.type === 'fields' || row.type === 'repeated') {
        if (!Array.isArray(row.fields)) return errors.push(t('designer.jsonMustBeList', { at: rowAt, prop: 'fields' }))
        row.fields.forEach((field: any, fieldIndex: number) => {
          const fieldAt = `${rowAt}.fields[${fieldIndex}]`
          if (typeof field?.key !== 'string') errors.push(mustBeText(fieldAt, 'key'))
          if (!isText(field?.label)) errors.push(mustBeText(fieldAt, 'label'))
          if (!fieldTypes.includes(field?.type)) errors.push(t('designer.jsonFieldType', { at: fieldAt, type: String(field?.type), types: fieldTypes.join(', ') }))
          if (field?.options !== undefined && !Array.isArray(field.options)) errors.push(t('designer.jsonOptionsList', { at: fieldAt }))
        })
      }
    })
  })
  return errors
}
