import { getAnswer, isEmptyAnswer } from './paths'
import type { Answers, Condition, FieldCondition, FormDefinition, Lookups, OwnFieldCondition, Page, Row } from './types'

// The repeated item a condition is evaluated in: its row, position, values and the field keys that resolve to the item first.
export type ItemScope = { rowKey: string; index: number; values: Answers; fieldKeys: string[] }

export type ConditionContext = { answers: Answers; lookups?: Lookups; item?: ItemScope }

// Reads "key.rest" where key names an answer at `basePath`: through the lookup result when one exists for that path, else the stored answer.
function readFrom(container: Answers | undefined, basePath: string, segments: string[], lookups: Lookups | undefined) {
  const [head, ...rest] = segments
  const answerPath = basePath === '' ? head : `${basePath}.${head}`
  const lookup = rest.length > 0 && lookups && Object.hasOwn(lookups, answerPath) ? lookups[answerPath] : undefined
  return lookup ? getAnswer(lookup, rest) : getAnswer(container, segments)
}

function resolveField(path: string, context: ConditionContext) {
  const segments = path.split('.')
  const { item } = context
  if (item && item.fieldKeys.includes(segments[0])) return readFrom(item.values, `${item.rowKey}[${item.index}]`, segments, context.lookups)
  return readFrom(context.answers, '', segments, context.lookups)
}

// Strict: numbers and numeric text only, so an empty answer is never 0.
export const numberValue = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

function sameValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((entry) => sameValue(entry, expected))
  if (actual === expected) return true
  if (typeof expected === 'number' || typeof actual === 'number') {
    const left = numberValue(actual)
    const right = numberValue(expected)
    return left !== null && left === right
  }
  return false
}

function compareNumbers(actual: unknown, expected: unknown, test: (left: number, right: number) => boolean) {
  const left = numberValue(actual)
  const right = numberValue(expected)
  return left !== null && right !== null && test(left, right)
}

// Missing values are not equal to anything, so notEquals and notIn are true for them; numeric conditions are false unless both sides are numbers.
export function testValue(actual: unknown, condition: OwnFieldCondition): boolean {
  const { value } = condition
  switch (condition.condition) {
    case 'equals':
      return sameValue(actual, value)
    case 'notEquals':
      return !sameValue(actual, value)
    case 'in':
      return Array.isArray(value) && value.some((entry) => sameValue(actual, entry))
    case 'notIn':
      return !(Array.isArray(value) && value.some((entry) => sameValue(actual, entry)))
    case 'greaterThan':
      return compareNumbers(actual, value, (left, right) => left > right)
    case 'lessThan':
      return compareNumbers(actual, value, (left, right) => left < right)
    case 'greaterThanOrEqual':
      return compareNumbers(actual, value, (left, right) => left >= right)
    case 'lessThanOrEqual':
      return compareNumbers(actual, value, (left, right) => left <= right)
    case 'isEmpty':
      return isEmptyAnswer(actual)
    case 'isNotEmpty':
      return !isEmptyAnswer(actual)
    default:
      return false
  }
}

// "coApplicants.disability.status" with match: tests "disability.status" inside every item of coApplicants. No items: any → false, all → true, none → true.
function testAcrossItems(condition: FieldCondition, context: ConditionContext) {
  const [rowKey, ...rest] = condition.field.split('.')
  const stored = getAnswer(context.answers, rowKey)
  const items: Answers[] = Array.isArray(stored) ? stored : []
  const results = items.map((item, index) => testValue(readFrom(item, `${rowKey}[${index}]`, rest, context.lookups), condition))
  if (condition.match === 'any') return results.some(Boolean)
  if (condition.match === 'all') return results.every(Boolean)
  return !results.some(Boolean)
}

export function evaluateCondition(condition: Condition | null | undefined, context: ConditionContext): boolean {
  if (!condition) return true
  if ('all' in condition) return condition.all.every((part) => evaluateCondition(part, context))
  if ('any' in condition) return condition.any.some((part) => evaluateCondition(part, context))
  if ('not' in condition) return !evaluateCondition(condition.not, context)
  if (condition.match) return testAcrossItems(condition, context)
  return testValue(resolveField(condition.field, context), condition)
}

// A field message's `when` without `field` is evaluated against the field's own value.
export function evaluateFieldCondition(when: OwnFieldCondition | Condition, fieldKey: string, context: ConditionContext) {
  if ('field' in when || 'all' in when || 'any' in when || 'not' in when) return evaluateCondition(when as Condition, context)
  return evaluateCondition({ field: fieldKey, ...when }, context)
}

export function visiblePages(definition: FormDefinition, answers: Answers, lookups?: Lookups): Page[] {
  return definition.pages.filter((page) => evaluateCondition(page.showIf, { answers, lookups }))
}

export function visibleRows(page: Page, answers: Answers, lookups?: Lookups): Row[] {
  return page.rows.filter((row) => evaluateCondition(row.showIf, { answers, lookups }))
}

// Every field key a condition reads (the first path segment; for match conditions the row key and the item field).
export function conditionFieldKeys(condition: Condition | OwnFieldCondition | null | undefined): string[] {
  if (!condition) return []
  if ('all' in condition) return condition.all.flatMap(conditionFieldKeys)
  if ('any' in condition) return condition.any.flatMap(conditionFieldKeys)
  if ('not' in condition) return conditionFieldKeys(condition.not)
  if (!('field' in condition)) return []
  const segments = condition.field.split('.')
  return condition.match ? segments.slice(0, 2) : [segments[0]]
}
