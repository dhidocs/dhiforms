import { compact, keyBy, round, uniq } from 'lodash-es'
import { evaluateCondition, numberValue } from './conditions'
import { formFields, itemScope, repeatedRows, type FormFieldEntry, type RepeatedRow } from './fields'
import { isEmptyAnswer, ownValue } from './paths'
import type { Answers, FormDefinition, Formula, Lookups } from './types'

// Today's date in the Maldives (UTC+5, no daylight saving) as YYYY-MM-DD; AGE and rules count from it.
export const todayInMaldives = (now = new Date()) => new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Today's date in the browser's (or server's) own time zone as YYYY-MM-DD.
export const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

// Every field key a formula reads: the first segment of each text argument, the item field of a column, and COUNT's `where` field.
export function formulaReferences(formula: Formula | undefined): string[] {
  if (!formula) return []
  const fromArgs = formula.args.flatMap((arg) => (typeof arg === 'string' ? arg.split('.').slice(0, 2) : []))
  return uniq(compact([...fromArgs, formula.where?.field.split('.')[0]]))
}

const computedEntries = (definition: FormDefinition) => formFields(definition).filter(({ field }) => field.type === 'computed' && field.formula)

// The keys of one cycle between computed fields (first key repeated at the end), or null when there is none.
export function formulaCycle(definition: FormDefinition): string[] | null {
  const byKey = keyBy(computedEntries(definition), ({ field }) => field.key)
  const state: Record<string, 'visiting' | 'done'> = {}
  const visit = (key: string, trail: string[]): string[] | null => {
    if (state[key] === 'done') return null
    if (state[key] === 'visiting') return [...trail.slice(trail.indexOf(key)), key]
    state[key] = 'visiting'
    for (const next of formulaReferences(byKey[key].field.formula).filter((ref) => Object.hasOwn(byKey, ref))) {
      const cycle = visit(next, [...trail, key])
      if (cycle) return cycle
    }
    state[key] = 'done'
    return null
  }
  for (const key of Object.keys(byKey)) {
    const cycle = visit(key, [])
    if (cycle) return cycle
  }
  return null
}

// Computed fields ordered so each comes after the computed fields it reads. Fields caught in a cycle are left out.
function evaluationOrder(entries: FormFieldEntry[]): FormFieldEntry[] {
  const byKey = keyBy(entries, ({ field }) => field.key)
  const ordered: FormFieldEntry[] = []
  const state: Record<string, 'visiting' | 'done' | 'cycle'> = {}
  const visit = (key: string): boolean => {
    if (state[key] === 'done') return true
    if (state[key] === 'visiting' || state[key] === 'cycle') return false
    state[key] = 'visiting'
    const dependencies = formulaReferences(byKey[key].field.formula).filter((ref) => Object.hasOwn(byKey, ref))
    const resolvable = dependencies.every(visit)
    state[key] = resolvable ? 'done' : 'cycle'
    if (resolvable) ordered.push(byKey[key])
    return resolvable
  }
  Object.keys(byKey).forEach(visit)
  return ordered
}

type FormulaScope = { answers: Answers; lookups: Lookups; today: string; rows: Record<string, RepeatedRow>; item?: Answers; itemKeys?: string[] }

// A plain argument reads the same item first (inside a repeated row), then the top-level answers.
function readArgument(arg: string | number, scope: FormulaScope): unknown {
  if (typeof arg === 'number') return arg
  if (scope.item && scope.itemKeys?.includes(arg)) return ownValue(scope.item, arg)
  return ownValue(scope.answers, arg)
}

function columnValues(column: string, scope: FormulaScope): unknown[] {
  const [rowKey, fieldKey] = column.split('.')
  const items = ownValue(scope.answers, rowKey)
  return Array.isArray(items) ? items.map((item) => ownValue(item, fieldKey)) : []
}

const isColumn = (arg: string | number): arg is string => typeof arg === 'string' && arg.includes('.')

// Days since 1970-01-01 for a YYYY-MM-DD answer, or null when it is not a date.
function dayNumber(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

function wholeYears(from: unknown, today: string) {
  if (dayNumber(from) === null || dayNumber(today) === null) return null
  const [birthYear, birthMonth, birthDay] = String(from).slice(0, 10).split('-').map(Number)
  const [year, month, day] = today.split('-').map(Number)
  const age = year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)
  return age >= 0 ? age : null
}

function countItems(formula: Formula, scope: FormulaScope) {
  const [target] = formula.args
  if (typeof target !== 'string') return null
  if (isColumn(target)) return columnValues(target, scope).filter((value) => !isEmptyAnswer(value)).length
  const row = scope.rows[target]
  const items = ownValue(scope.answers, target)
  if (!row || !Array.isArray(items)) return 0
  return items.filter((values, index) => !formula.where || evaluateCondition(formula.where, { answers: scope.answers, lookups: scope.lookups, item: itemScope(row, index, values) })).length
}

// SUM and DIFFERENCE count empty answers as 0 once any value is entered; the other functions return null until every argument is there.
export function evaluateFormula(formula: Formula, scope: FormulaScope): number | null {
  const plain = formula.args.map((arg) => (isColumn(arg) ? null : numberValue(readArgument(arg, scope))))
  const allPresent = plain.length > 0 && plain.every((value) => value !== null)

  switch (formula.fn) {
    case 'SUM': {
      const values = formula.args.flatMap((arg) => (isColumn(arg) ? columnValues(arg, scope).map(numberValue) : [numberValue(readArgument(arg, scope))])).filter((value) => value !== null)
      return values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0), 2)
    }
    case 'DIFFERENCE': {
      if (plain.every((value) => value === null)) return null
      const [first, ...rest] = plain.map((value) => value ?? 0)
      return round(rest.reduce((total, value) => total - value, first ?? 0), 2)
    }
    case 'PRODUCT':
      return allPresent ? round(plain.reduce((product, value) => product * value, 1), 2) : null
    case 'DIVIDE':
      return allPresent && plain.length === 2 && plain[1] !== 0 ? round(plain[0] / plain[1], 2) : null
    case 'COUNT':
      return countItems(formula, scope)
    case 'AGE':
      return wholeYears(readArgument(formula.args[0], scope), scope.today)
    case 'DAYS_BETWEEN': {
      const [start, end] = formula.args.map((arg) => dayNumber(readArgument(arg, scope)))
      return start != null && end != null ? end - start : null
    }
    default:
      return null
  }
}

// The answers with every computed field filled in, in dependency order (per item inside a repeated row). The server recomputes and ignores sent values.
export function computeValues(definition: FormDefinition, answers: Answers, today: string, lookups: Lookups = {}): Answers {
  const rows = keyBy(repeatedRows(definition), 'key')
  const result: Answers = { ...answers }
  for (const { field, repeated } of evaluationOrder(computedEntries(definition))) {
    if (!repeated) {
      result[field.key] = evaluateFormula(field.formula!, { answers: result, lookups, today, rows })
      continue
    }
    const items = ownValue(result, repeated.key)
    if (!Array.isArray(items)) continue
    const itemKeys = repeated.fields.map((candidate) => candidate.key)
    result[repeated.key] = items.map((item: Answers) => ({ ...item, [field.key]: evaluateFormula(field.formula!, { answers: result, lookups, today, rows, item, itemKeys }) }))
  }
  return result
}
