import { visiblePages } from './conditions'
import { visibleFields } from './fields'
import { localize } from './text'
import type { Answers, FormDefinition, FormLists, Lookups, RuleFn, RuleOutcome, RuleResult } from './types'

// Business rules implemented in code, keyed "<formKey>/<ruleId>". The host app registers its rule functions with registerRule() before rendering a form.
const registry = new Map<string, RuleFn>()

const registryKey = (formKey: string, ruleId: string) => `${formKey}/${ruleId}`

export function registerRule(formKey: string, ruleId: string, fn: RuleFn) {
  registry.set(registryKey(formKey, ruleId), fn)
}

export const implementedRules = () => [...registry.keys()]

export const isRuleImplemented = (formKey: string, ruleId: string) => registry.has(registryKey(formKey, ruleId))

export type RuleRunContext = { answers: Answers; lookups?: Lookups; lists?: FormLists; today: string }

// Runs implemented rules on visible fields (per item in repeated rows); 'requested' rules have no code yet. A rule that throws becomes a blocking error naming it.
export function runRules(definition: FormDefinition, context: RuleRunContext): RuleOutcome[] {
  const { answers, lookups = {}, lists = {}, today } = context
  const outcomes: RuleOutcome[] = []
  for (const page of visiblePages(definition, answers, lookups)) {
    for (const { field, path, value, item, rowKey, index } of visibleFields(page, answers, lookups)) {
      for (const rule of field.businessRules ?? []) {
        const fn = registry.get(registryKey(definition.key, rule.id))
        if (!fn) continue
        let results: RuleResult[]
        try {
          results = fn({ answers, lookups, lists, today, field: { key: field.key, path, value, item: item?.values, index, rowKey } })
          if (!Array.isArray(results)) throw new Error('it did not return a list of results')
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          const message = {
            en: `Business rule ${rule.id} on '${localize(field.label)}' could not run (${reason}), so this form can't continue. Contact Admin`,
            dv: `'${localize(field.label, 'dv')}' ގެ ބިޒްނަސް ރޫލް ${rule.id} ހިންގޭތޯ ނުވި (${reason})، އެހެންވެ މި ފޯމު ކުރިއަށް ނުގެންދެވޭނެ. އެޑްމިނާ ގުޅުއްވާ`,
          }
          results = [{ type: 'error', path, message }]
        }
        outcomes.push(...results.map((result) => ({ ...result, ruleId: rule.id, fieldPath: path, pageKey: page.key })))
      }
    }
  }
  return outcomes
}
