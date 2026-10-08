import { describe, expect, it } from 'vitest'
import { implementedRules, isRuleImplemented, registerRule, runRules } from '../src/core/rules'
import { localize } from '../src/core/text'
import { pageRuleResults, validateForm, type FormState } from '../src/core/validate'
import { sampleForm } from './fixtures'

const today = '2026-10-07'

registerRule('test-financing', 'br_cap', ({ field }) => (Number(field.value) > 2_000_000 ? [{ type: 'error', path: field.path, message: 'Enter a cost of 2,000,000 or less' }] : []))

describe('registry', () => {
  it('knows which rules have code', () => {
    expect(isRuleImplemented('test-financing', 'br_cap')).toBe(true)
    expect(isRuleImplemented('test-financing', 'br_missing')).toBe(false)
    expect(implementedRules()).toContain('test-financing/br_cap')
  })
})

describe('runRules', () => {
  it('runs rules on visible fields and tags each result with its rule and page', () => {
    const outcomes = runRules(sampleForm(), { answers: { cost: 2_500_000 }, today })
    expect(outcomes).toEqual([{ type: 'error', path: 'cost', message: 'Enter a cost of 2,000,000 or less', ruleId: 'br_cap', fieldPath: 'cost', pageKey: 'financing' }])
    expect(runRules(sampleForm(), { answers: { cost: 100 }, today })).toEqual([])
  })

  it('skips rules on hidden fields and rules without code', () => {
    const definition = sampleForm()
    const fields = (definition.pages[0].rows[1] as any).fields
    fields[1].showIf = { field: 'financingType', condition: 'equals', value: 'business' }
    fields[2].businessRules = [{ id: 'br_requested', description: 'Not built yet' }]
    expect(runRules(definition, { answers: { cost: 2_500_000, ownFunds: 1 }, today })).toEqual([])
  })

  it('turns a rule that throws into a blocking error that names it', () => {
    const definition = sampleForm()
    ;(definition.pages[0].rows[1] as any).fields[2].businessRules = [{ id: 'br_broken', description: 'Breaks' }]
    registerRule('test-financing', 'br_broken', () => {
      throw new Error('lookup data missing')
    })
    const [outcome] = runRules(definition, { answers: {}, today })
    expect(outcome.type).toBe('error')
    expect(localize(outcome.message)).toContain('br_broken')
    expect(localize(outcome.message).endsWith('Contact Admin')).toBe(true)
    expect(localize(outcome.message, 'dv')).toContain('br_broken')
  })
})

describe('rule results in validation', () => {
  const state = (answers: Record<string, unknown>): FormState => ({ answers, lists: {}, today })

  it('places errors and warnings on the page they belong to', () => {
    const definition = sampleForm()
    const outcomes = [
      { type: 'error' as const, path: 'cost', message: 'Too high', ruleId: 'br_cap', fieldPath: 'cost', pageKey: 'financing' },
      { type: 'warning' as const, path: 'coApplicants[0].nid', message: 'Check this', ruleId: 'br_x', fieldPath: 'coApplicants[0].nid', pageKey: 'household' },
    ]
    const answers = { coApplicants: [{ nid: 'A111111' }] }
    expect(pageRuleResults(definition.pages[0], state(answers), outcomes)).toEqual({ errors: { cost: 'Too high' }, warnings: {}, endForm: null })
    expect(pageRuleResults(definition.pages[1], state(answers), outcomes)).toEqual({ errors: {}, warnings: { 'coApplicants[0].nid': 'Check this' }, endForm: null })
    expect(pageRuleResults(definition.pages[0], state(answers), outcomes, (path) => path !== 'cost').errors).toEqual({})
  })

  it('validateForm merges field and rule errors, field errors first', () => {
    const problems = validateForm(sampleForm(), state({ financingType: 'business', cost: 2_500_000, coApplicants: [{ nid: 'A1' }] }))
    const english = (errors: Record<string, Parameters<typeof localize>[0]>) => Object.fromEntries(Object.entries(errors).map(([path, message]) => [path, localize(message)]))
    expect(problems.map((problem) => [problem.page.key, english(problem.errors)])).toEqual([
      ['financing', { cost: 'Enter a cost of 2,000,000 or less' }],
      ['household', { 'coApplicants[0].nid': 'Enter the national ID as the letter A followed by 6 digits, for example A123456' }],
    ])
  })

  it('does not validate computed fields', () => {
    const definition = sampleForm()
    ;(definition.pages[0].rows[1] as any).fields[3].required = true
    expect(validateForm(definition, state({ financingType: 'business', cost: 1 }))).toEqual([])
  })
})
