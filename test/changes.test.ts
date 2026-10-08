import { describe, expect, it } from 'vitest'
import { assignIds, buildChangeRequest, diffDefinitions, listBusinessRules, needsDeveloper } from '../src/core/changes'
import type { Field } from '../src/core/types'
import { sampleForm } from './fixtures'

const base = () => assignIds(sampleForm())
const fieldsOf = (definition: ReturnType<typeof base>, page: number, row: number): Field[] => (definition.pages[page].rows[row] as any).fields

describe('assignIds', () => {
  it('gives every page, row and field a stable id', () => {
    const first = base()
    expect(first.pages[0].id).toBe('p_financing')
    expect(first.pages[1].rows[0].id).toBe('r_coApplicants')
    expect(fieldsOf(first, 1, 0)[0].id).toBe('f_coApplicants_nid')
    expect(fieldsOf(first, 0, 1)[1].id).toBe('f_cost')
    expect(base()).toEqual(first)
  })

  it('keeps existing ids and never reuses one', () => {
    const definition = sampleForm()
    ;(definition.pages[0].rows[1] as any).fields[0].id = 'f_cost'
    const result = assignIds(definition)
    expect(fieldsOf(result, 0, 1).map((field) => field.id)).toEqual(['f_cost', 'f_cost_2', 'f_ownFunds', 'f_loan'])
  })
})

describe('diffDefinitions', () => {
  it('finds no changes between equal versions', () => {
    expect(diffDefinitions(base(), { ...base(), version: 2 })).toEqual([])
  })

  it('classifies labels, help, text, option labels and order as cosmetic', () => {
    const next = base()
    const fields = fieldsOf(next, 0, 1)
    fields[0].label = 'Kind of financing'
    fields[0].options = [{ value: 'business', label: 'Business loan' }, { value: 'personal', label: 'Personal' }]
    fields[1].help = 'From your booking'
    ;(next.pages[0].rows[0] as any).text = 'The request'
    fields.reverse()
    next.pages.reverse()
    const changes = diffDefinitions(base(), next)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every((change) => change.cosmetic)).toBe(true)
    expect(needsDeveloper(changes)).toBe(false)
  })

  it('treats a Dhivehi-only edit as cosmetic and says it was the Dhivehi text', () => {
    const translated = base()
    const fields = fieldsOf(translated, 0, 1)
    translated.title = { en: 'Test application', dv: 'ޓެސްޓް އެޕްލިކޭޝަން' }
    fields[0].label = { en: 'Type of financing', dv: 'ފައިނޭންސިންގގެ ބާވަތް' }
    fields[0].options = [{ value: 'personal', label: { en: 'Personal', dv: 'ޕާސަނަލް' } }, { value: 'business', label: 'Business' }]
    fields[0].messages = [{ when: { condition: 'equals', value: 'business' }, tone: 'info', blocking: false, text: { en: 'Attach a business plan', dv: 'ބިޒްނަސް ޕްލޭނެއް ހުށަހަޅުއްވާ' } }]
    const before = base()
    fieldsOf(before, 0, 1)[0].messages = [{ when: { condition: 'equals', value: 'business' }, tone: 'info', blocking: false, text: 'Attach a business plan' }]
    const changes = diffDefinitions(before, translated)
    expect(changes.length).toBe(4)
    expect(needsDeveloper(changes)).toBe(false)
    expect(changes.map((change) => change.summary)).toContain("Field 'Type of financing' (financingType): Dhivehi label changed from nothing to 'ފައިނޭންސިންގގެ ބާވަތް'")

    const reworded = assignIds(translated)
    fieldsOf(reworded, 0, 1)[0].label = { en: 'Type of financing', dv: 'ޔުނިޓް' }
    expect(diffDefinitions(translated, reworded).map((change) => [change.cosmetic, change.summary])).toEqual([[true, "Field 'Type of financing' (financingType): Dhivehi label changed from 'ފައިނޭންސިންގގެ ބާވަތް' to 'ޔުނިޓް'"]])
  })

  it('needs a developer for keys, validations, conditions, option values, formulas and rules', () => {
    const cases: ((fields: Field[]) => void)[] = [
      (fields) => (fields[1].key = 'totalCost'),
      (fields) => (fields[1].min = 1),
      (fields) => (fields[2].showIf = { field: 'financingType', condition: 'equals', value: 'business' }),
      (fields) => fields[0].options!.push({ value: 'other', label: 'Other' }),
      (fields) => (fields[3].formula = { fn: 'SUM', args: ['cost'] }),
      (fields) => fields[1].businessRules!.push({ id: 'br_new', description: 'New rule' }),
      (fields) => (fields[1].businessRules![0].description = 'Reworded'),
      (fields) => fields.splice(2, 1),
      (fields) => fields.push({ id: 'f_new', key: 'extra', type: 'text', label: 'Extra' }),
    ]
    for (const change of cases) {
      const next = base()
      change(fieldsOf(next, 0, 1))
      expect(needsDeveloper(diffDefinitions(base(), next))).toBe(true)
    }
  })

  it('compares by id, so a re-keyed field is one change, not a removal and an addition', () => {
    const next = base()
    fieldsOf(next, 0, 1)[1].key = 'totalCost'
    const changes = diffDefinitions(base(), next)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ target: 'field', kind: 'changed', id: 'f_cost', cosmetic: false })
  })

  it('treats moving a field into a repeated group as a developer change', () => {
    const next = base()
    const [ownFunds] = fieldsOf(next, 0, 1).splice(2, 1)
    fieldsOf(next, 1, 0).push(ownFunds)
    const changes = diffDefinitions(base(), next)
    expect(changes.find((change) => change.id === 'f_ownFunds')).toMatchObject({ kind: 'moved', cosmetic: false })
  })
})

describe('buildChangeRequest', () => {
  it('lists the requested rules and the changes', () => {
    const next = { ...base(), version: 2 }
    fieldsOf(next, 0, 1)[2].businessRules = [{ id: 'br_ownFundsMinimum', description: 'Own funds must be at least 10% of the cost' }]
    fieldsOf(next, 0, 1)[0].label = 'Kind of financing'
    const markdown = buildChangeRequest(base(), next, ['test-financing/br_cap'])
    expect(markdown).toContain('# Change request: Test application, version 2')
    expect(markdown).toContain('Compared with published version 1.')
    expect(markdown).toContain("registerRule('test-financing', 'br_ownFundsMinimum', fn)")
    expect(markdown).toContain('Own funds must be at least 10% of the cost')
    expect(markdown).toContain('1 business rule to implement, 1 already implemented')
    expect(markdown).toContain("label changed from 'Type of financing' to 'Kind of financing'")
    expect(markdown).toContain('`disability` (Disability registration)')
    expect(markdown).toContain('"key": "test-financing"')
  })

  it('lists rules with their field and status', () => {
    const listing = listBusinessRules(base(), [])
    expect(listing).toHaveLength(1)
    expect(listing[0]).toMatchObject({ implemented: false, pageTitle: 'Financing', rule: { id: 'br_cap' } })
  })
})
