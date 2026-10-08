// Form definition format. Hierarchy is always Page → Row → Field; fields never nest.

export type ConditionName =
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'isEmpty'
  | 'isNotEmpty'

export const conditionNames: ConditionName[] = ['equals', 'notEquals', 'in', 'notIn', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual', 'isEmpty', 'isNotEmpty']

// `match` tests the condition across the items of a repeated row: field is "<rowKey>.<fieldKey>[.status|.data.x]".
export type FieldCondition = { field: string; condition: ConditionName; value?: unknown; match?: 'any' | 'all' | 'none' }

export type Condition = FieldCondition | { all: Condition[] } | { any: Condition[] } | { not: Condition }

// A field message's `when` may leave out `field`; it then tests the field's own value.
export type OwnFieldCondition = Omit<FieldCondition, 'field' | 'match'>

// Any text respondents and reviewers read: plain English, or English with a Dhivehi translation. localize() picks the language.
export type Language = 'en' | 'dv'

export type Text = string | { en: string; dv?: string }

export type Option = { value: string; label: Text }

export type FieldMessage = {
  when: OwnFieldCondition | Condition
  tone: 'info' | 'warning' | 'success' | 'error'
  blocking: boolean
  text: Text
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'amount'
  | 'date'
  | 'radio'
  | 'select'
  | 'checkbox'
  | 'checkboxGroup'
  | 'nid'
  | 'phone'
  | 'email'
  | 'file'
  | 'lookup'
  | 'computed'

export const fieldTypes: FieldType[] = [
  'text',
  'textarea',
  'number',
  'amount',
  'date',
  'radio',
  'select',
  'checkbox',
  'checkboxGroup',
  'nid',
  'phone',
  'email',
  'file',
  'lookup',
  'computed',
]

export type FormulaFn = 'SUM' | 'DIFFERENCE' | 'PRODUCT' | 'DIVIDE' | 'COUNT' | 'AGE' | 'DAYS_BETWEEN'

export const formulaFns: FormulaFn[] = ['SUM', 'DIFFERENCE', 'PRODUCT', 'DIVIDE', 'COUNT', 'AGE', 'DAYS_BETWEEN']

// One function per computed field. Args are field keys, repeated-row columns ("coApplicants.income", SUM only), row keys (COUNT) or numbers.
// COUNT may count only the items matching `where`, whose field is a key inside the repeated row.
export type Formula = { fn: FormulaFn; args: (string | number)[]; where?: FieldCondition }

// Plain-language rule written by the admin; a developer implements it in code under the same id and registers it with registerRule().
export type BusinessRule = { id: string; description: string }

export type Field = {
  id?: string
  key: string
  type: FieldType
  label: Text
  required?: boolean
  help?: Text
  placeholder?: Text
  readOnly?: boolean
  width?: number
  showIf?: Condition | null
  options?: Option[]
  optionsFrom?: string
  related?: { label: Text; from: string; property: string }[]
  messages?: FieldMessage[]
  prefill?: string
  // text fields only: 'rtl' for Thaana input such as a name in Dhivehi
  dir?: 'rtl'
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  mustBeTrue?: boolean
  file?: { accept: string[]; maxSizeMb: number; maxFiles: number }
  // lookup fields only: connector key and input mapping (input key → "self.nid" | field key)
  connector?: string
  inputs?: Record<string, string>
  // computed fields only
  formula?: Formula
  format?: 'number' | 'amount'
  businessRules?: BusinessRule[]
}

export type RowType = 'fields' | 'heading' | 'subheading' | 'paragraph' | 'break' | 'repeated'

export type Row =
  | { id?: string; type: 'fields'; fields: Field[]; showIf?: Condition | null }
  | { id?: string; type: 'heading' | 'subheading' | 'paragraph'; text: Text; showIf?: Condition | null }
  | { id?: string; type: 'break'; showIf?: Condition | null }
  | {
      id?: string
      type: 'repeated'
      key: string
      label?: Text
      itemLabel?: Text
      repeatType: 'fixed' | 'add'
      numRepeats?: number
      minRepeats?: number
      maxRepeats?: number
      fields: Field[]
      showIf?: Condition | null
    }

export type Page = { id?: string; key: string; title: Text; description?: Text; showIf?: Condition | null; rows: Row[] }

export type FormDefinition = { key: string; version: number; title: Text; pages: Page[] }

export type FormStatus = 'draft' | 'awaiting_dev' | 'published' | 'archived'

export type Answers = Record<string, any>

// What a lookup field's answer resolves to for display and conditions. The stored answer is only a reference.
export type LookupResult = {
  status: 'found' | 'not_found' | 'error' | 'pending'
  data?: Record<string, unknown>
  checkedAt?: string
  recordId?: number
}

// Lookup results keyed by answer path, e.g. "applicantDisability" or "coApplicants[0].disability".
export type Lookups = Record<string, LookupResult>

export type RuleResult =
  | { type: 'error'; path: string; message: Text }
  | { type: 'warning'; path: string; message: Text }
  | { type: 'endForm'; outcome: 'not_eligible'; message: Text }

export type FormLists = Record<string, { value: string; label: string; meta?: Record<string, any> }[]>

// What a rule receives: answers with computed values, lookups, option lists (e.g. a scheme's income cap) and the field it is attached to, once per item in a repeated row.
export type RuleContext = {
  answers: Answers
  lookups: Lookups
  lists: FormLists
  today: string
  field: { key: string; path: string; value: unknown; item?: Answers; index?: number; rowKey?: string }
}

export type RuleFn = (context: RuleContext) => RuleResult[]

// A rule result with the rule and the field it came from, so the renderer can place it on the right page.
export type RuleOutcome = RuleResult & { ruleId: string; fieldPath: string; pageKey: string }
