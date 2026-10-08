import { describe, expect, it } from 'vitest'
import { computeValues, evaluateFormula, formulaCycle, formulaReferences, todayInMaldives } from '../src/core/formulas'
import type { Formula, FormDefinition } from '../src/core/types'
import { sampleForm } from './fixtures'

const today = '2026-10-07'
const scope = (answers: Record<string, unknown>) => ({ answers, lookups: {}, today, rows: {} })
const run = (fn: Formula['fn'], args: Formula['args'], answers: Record<string, unknown> = {}) => evaluateFormula({ fn, args }, scope(answers))

describe('formula functions', () => {
  it('SUM adds numbers and treats empty answers as 0 once one value exists', () => {
    expect(run('SUM', ['a', 'b', 10], { a: 1, b: '2' })).toBe(13)
    expect(run('SUM', ['a', 'b'], { a: 5 })).toBe(5)
    expect(run('SUM', ['a', 'b'], {})).toBeNull()
    expect(run('SUM', ['a', 'b'], { a: 0.1, b: 0.2 })).toBe(0.3)
  })

  it('DIFFERENCE subtracts the rest from the first', () => {
    expect(run('DIFFERENCE', ['cost', 'ownFunds'], { cost: 1000, ownFunds: 250 })).toBe(750)
    expect(run('DIFFERENCE', ['cost', 'ownFunds'], { cost: 1000 })).toBe(1000)
    expect(run('DIFFERENCE', ['cost', 'ownFunds'], {})).toBeNull()
  })

  it('PRODUCT and DIVIDE need every argument', () => {
    expect(run('PRODUCT', ['a', 12], { a: 1500 })).toBe(18000)
    expect(run('PRODUCT', ['a', 'b'], { a: 2 })).toBeNull()
    expect(run('DIVIDE', ['a', 3], { a: 10 })).toBe(3.33)
    expect(run('DIVIDE', ['a', 'b'], { a: 10, b: 0 })).toBeNull()
    expect(run('DIVIDE', ['a', 'b'], { a: 10 })).toBeNull()
  })

  it('AGE counts whole years to today', () => {
    expect(run('AGE', ['dob'], { dob: '2000-10-07' })).toBe(26)
    expect(run('AGE', ['dob'], { dob: '2000-10-08' })).toBe(25)
    expect(run('AGE', ['dob'], { dob: '2030-01-01' })).toBeNull()
    expect(run('AGE', ['dob'], { dob: 'not a date' })).toBeNull()
  })

  it('DAYS_BETWEEN counts days from the first date to the second', () => {
    expect(run('DAYS_BETWEEN', ['from', 'to'], { from: '2026-02-27', to: '2026-03-02' })).toBe(3)
    expect(run('DAYS_BETWEEN', ['from', 'to'], { from: '2026-03-02', to: '2026-02-27' })).toBe(-3)
    expect(run('DAYS_BETWEEN', ['from', 'to'], { from: '2026-03-02' })).toBeNull()
  })

  it("uses the Maldives date, which is UTC+5", () => {
    expect(todayInMaldives(new Date('2026-10-06T18:59:00Z'))).toBe('2026-10-06')
    expect(todayInMaldives(new Date('2026-10-06T19:00:00Z'))).toBe('2026-10-07')
  })
})

describe('computeValues', () => {
  it('fills computed fields, including columns and counts', () => {
    const answers = { cost: 2_000_000, ownFunds: 200_000, monthlyIncome: 20_000, coApplicants: [{ income: 15_000 }, { income: '5000' }, {}] }
    const result = computeValues(sampleForm(), answers, today)
    expect(result.loan).toBe(1_800_000)
    expect(result.householdIncome).toBe(40_000)
    expect(result.members).toBe(3)
    expect(answers).not.toHaveProperty('loan')
  })

  it('counts only the items matching where, reading lookups', () => {
    const definition = sampleForm()
    const members = definition.pages[1].rows[1] as any
    members.fields[2].formula = { fn: 'COUNT', args: ['coApplicants'], where: { field: 'disability.status', condition: 'equals', value: 'found' } }
    const lookups = { 'coApplicants[0].disability': { status: 'found' as const }, 'coApplicants[1].disability': { status: 'not_found' as const } }
    expect(computeValues(definition, { coApplicants: [{}, {}] }, today, lookups).members).toBe(1)
  })

  it('evaluates chained computed fields in dependency order', () => {
    const definition: FormDefinition = {
      key: 'chain',
      version: 1,
      title: 'Chain',
      pages: [
        {
          key: 'one',
          title: 'One',
          rows: [
            {
              type: 'fields',
              fields: [
                { key: 'loanNeeded', type: 'computed', label: 'Loan', formula: { fn: 'DIFFERENCE', args: ['total', 'contribution'] } },
                { key: 'total', type: 'computed', label: 'Total', formula: { fn: 'SUM', args: ['cost', 'fees'] } },
                { key: 'cost', type: 'amount', label: 'Cost' },
                { key: 'fees', type: 'amount', label: 'Fees' },
                { key: 'contribution', type: 'amount', label: 'Contribution' },
              ],
            },
          ],
        },
      ],
    }
    expect(computeValues(definition, { cost: 100, fees: 10, contribution: 30 }, today)).toMatchObject({ total: 110, loanNeeded: 80 })
  })

  it('computes per item inside a repeated row', () => {
    const definition = sampleForm()
    const repeated = definition.pages[1].rows[0] as any
    repeated.fields.push({ key: 'yearly', type: 'computed', label: 'Yearly', formula: { fn: 'PRODUCT', args: ['income', 12] } })
    expect(computeValues(definition, { coApplicants: [{ income: 100 }, {}] }, today).coApplicants).toEqual([{ income: 100, yearly: 1200 }, { yearly: null }])
  })
})

describe('formula references and cycles', () => {
  it('lists the keys a formula reads', () => {
    expect(formulaReferences({ fn: 'SUM', args: ['a', 'rows.income', 4] })).toEqual(['a', 'rows', 'income'])
    expect(formulaReferences({ fn: 'COUNT', args: ['rows'], where: { field: 'disability.status', condition: 'equals', value: 'found' } })).toEqual(['rows', 'disability'])
  })

  it('finds a cycle and leaves the fields in it uncomputed', () => {
    const definition = sampleForm()
    const fields = (definition.pages[0].rows[1] as any).fields
    fields.push({ key: 'a', type: 'computed', label: 'A', formula: { fn: 'SUM', args: ['b'] } }, { key: 'b', type: 'computed', label: 'B', formula: { fn: 'SUM', args: ['a', 'cost'] } })
    expect(formulaCycle(definition)).toEqual(['a', 'b', 'a'])
    const result = computeValues(definition, { cost: 5 }, today)
    expect(result.a).toBeUndefined()
    expect(result.loan).toBe(5)
    expect(formulaCycle(sampleForm())).toBeNull()
  })
})
