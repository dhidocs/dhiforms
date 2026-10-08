import { describe, expect, it } from 'vitest'
import { conditionFieldKeys, evaluateCondition, evaluateFieldCondition, testValue, type ConditionContext } from '../src/core/conditions'
import type { Condition, ConditionName } from '../src/core/types'

// Conformance table: [condition, value, actual, expected]. Missing values equal nothing; numeric conditions need numbers on both sides.
const table: [ConditionName, unknown, unknown, boolean][] = [
  ['equals', 'business', 'business', true],
  ['equals', 'business', 'personal', false],
  ['equals', 'business', undefined, false],
  ['equals', 3, '3', true],
  ['equals', 3, 'three', false],
  ['equals', true, true, true],
  ['equals', 'a', ['a', 'b'], true],
  ['notEquals', 'business', 'personal', true],
  ['notEquals', 'business', 'business', false],
  ['notEquals', 'found', undefined, true],
  ['in', ['a', 'b'], 'b', true],
  ['in', ['a', 'b'], 'c', false],
  ['in', ['a', 'b'], undefined, false],
  ['in', 'a', 'a', false],
  ['notIn', ['a', 'b'], 'c', true],
  ['notIn', ['a', 'b'], 'a', false],
  ['notIn', ['a', 'b'], undefined, true],
  ['greaterThan', 10, 11, true],
  ['greaterThan', 10, 10, false],
  ['greaterThan', 10, '11', true],
  ['greaterThan', 10, '', false],
  ['greaterThan', 10, undefined, false],
  ['greaterThan', 10, 'abc', false],
  ['lessThan', 10, 9, true],
  ['lessThan', 10, '', false],
  ['lessThan', 10, null, false],
  ['lessThan', 10, Number.NaN, false],
  ['greaterThanOrEqual', 18, 18, true],
  ['greaterThanOrEqual', 18, 17, false],
  ['lessThanOrEqual', 18, 18, true],
  ['lessThanOrEqual', 18, 19, false],
  ['lessThanOrEqual', 'x', 1, false],
  ['isEmpty', undefined, undefined, true],
  ['isEmpty', undefined, '', true],
  ['isEmpty', undefined, [], true],
  ['isEmpty', undefined, 0, false],
  ['isNotEmpty', undefined, 'x', true],
  ['isNotEmpty', undefined, null, false],
  ['isNotEmpty', undefined, false, true],
]

describe('testValue conformance', () => {
  it.each(table)('%s %j against %j is %s', (condition, value, actual, expected) => {
    expect(testValue(actual, { condition, value })).toBe(expected)
  })

  it('is false for an unknown condition name', () => {
    expect(testValue('x', { condition: 'contains' as ConditionName, value: 'x' })).toBe(false)
  })
})

describe('evaluateCondition', () => {
  const answers = {
    financingType: 'business',
    cost: 1_800_000,
    applicantDisability: { ref: 12 },
    coApplicants: [
      { nid: 'A111111', relationship: 'spouse', disability: { ref: 1 } },
      { nid: 'A222222', relationship: 'child', disability: { ref: null } },
    ],
  }
  const lookups = {
    applicantDisability: { status: 'found' as const, data: { age: 30, disabilityType: 'Physical' } },
    'coApplicants[0].disability': { status: 'found' as const },
    'coApplicants[1].disability': { status: 'not_found' as const },
  }
  const context: ConditionContext = { answers, lookups }

  it('treats a missing condition as true', () => {
    expect(evaluateCondition(null, context)).toBe(true)
    expect(evaluateCondition(undefined, context)).toBe(true)
  })

  it('combines with all, any and not', () => {
    const business: Condition = { field: 'financingType', condition: 'equals', value: 'business' }
    const cheap: Condition = { field: 'cost', condition: 'lessThan', value: 1_000_000 }
    expect(evaluateCondition({ all: [business, cheap] }, context)).toBe(false)
    expect(evaluateCondition({ any: [business, cheap] }, context)).toBe(true)
    expect(evaluateCondition({ not: cheap }, context)).toBe(true)
    expect(evaluateCondition({ all: [] }, context)).toBe(true)
    expect(evaluateCondition({ any: [] }, context)).toBe(false)
  })

  it('resolves lookup segments through the lookups, not the stored reference', () => {
    expect(evaluateCondition({ field: 'applicantDisability.status', condition: 'equals', value: 'found' }, context)).toBe(true)
    expect(evaluateCondition({ field: 'applicantDisability.data.age', condition: 'greaterThanOrEqual', value: 18 }, context)).toBe(true)
    expect(evaluateCondition({ field: 'applicantDisability.ref', condition: 'equals', value: 12 }, context)).toBe(false)
    expect(evaluateCondition({ field: 'applicantDisability.status', condition: 'equals', value: 'found' }, { answers })).toBe(false)
  })

  it('reads the same repeated item first', () => {
    const item = { rowKey: 'coApplicants', index: 1, values: answers.coApplicants[1], fieldKeys: ['nid', 'relationship', 'disability'] }
    expect(evaluateCondition({ field: 'relationship', condition: 'equals', value: 'child' }, { answers, lookups, item })).toBe(true)
    expect(evaluateCondition({ field: 'disability.status', condition: 'notEquals', value: 'found' }, { answers, lookups, item })).toBe(true)
    expect(evaluateCondition({ field: 'financingType', condition: 'equals', value: 'business' }, { answers, lookups, item })).toBe(true)
  })

  it('tests across repeated items with match', () => {
    const notFound = (match: 'any' | 'all' | 'none'): Condition => ({ field: 'coApplicants.disability.status', match, condition: 'notEquals', value: 'found' })
    expect(evaluateCondition(notFound('any'), context)).toBe(true)
    expect(evaluateCondition(notFound('all'), context)).toBe(false)
    expect(evaluateCondition(notFound('none'), context)).toBe(false)
    expect(evaluateCondition({ field: 'coApplicants.relationship', match: 'all', condition: 'in', value: ['spouse', 'child'] }, context)).toBe(true)
  })

  it('handles a repeated row without items', () => {
    const empty = { answers: {} }
    expect(evaluateCondition({ field: 'coApplicants.nid', match: 'any', condition: 'isNotEmpty' }, empty)).toBe(false)
    expect(evaluateCondition({ field: 'coApplicants.nid', match: 'all', condition: 'isNotEmpty' }, empty)).toBe(true)
    expect(evaluateCondition({ field: 'coApplicants.nid', match: 'none', condition: 'isNotEmpty' }, empty)).toBe(true)
  })

  it('never resolves inherited members', () => {
    expect(evaluateCondition({ field: 'constructor', condition: 'isNotEmpty' }, context)).toBe(false)
    expect(evaluateCondition({ field: 'financingType.length', condition: 'equals', value: 8 }, context)).toBe(false)
    expect(evaluateCondition({ field: 'cost.toFixed', condition: 'isNotEmpty' }, context)).toBe(false)
  })

  it('evaluates a field message against the field itself', () => {
    expect(evaluateFieldCondition({ condition: 'greaterThan', value: 1_000_000 }, 'cost', context)).toBe(true)
    expect(evaluateFieldCondition({ field: 'financingType', condition: 'equals', value: 'personal' }, 'cost', context)).toBe(false)
  })

  it('lists the field keys a condition reads', () => {
    expect(conditionFieldKeys({ all: [{ field: 'a.status', condition: 'isEmpty' }, { not: { field: 'rows.b', match: 'any', condition: 'isEmpty' } }] })).toEqual(['a', 'rows', 'b'])
    expect(conditionFieldKeys({ condition: 'isEmpty' })).toEqual([])
  })
})
