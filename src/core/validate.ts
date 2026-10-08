import { evaluateFieldCondition, visiblePages, visibleRows, type ConditionContext } from './conditions'
import { repeatedItems, visibleFields, type RepeatedRow } from './fields'
import { computeValues } from './formulas'
import { isEmptyAnswer } from './paths'
import { runRules } from './rules'
import { localize } from './text'
import type { Answers, Field, FieldMessage, FormDefinition, FormLists, Language, Lookups, Page, RuleOutcome, Text } from './types'

// Everything validation reads besides the definition. `answers` should already hold computed values (computeValues).
export type FormState = { answers: Answers; lookups?: Lookups; lists: FormLists; today: string }

export const nidPattern = /^A\d{6}$/
export const phonePattern = /^[79]\d{6}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Scope = (path: string) => boolean

export function visibleMessages(field: Field, context: ConditionContext): FieldMessage[] {
  return (field.messages ?? []).filter((message) => evaluateFieldCondition(message.when, field.key, context))
}

export function listOptions(field: Field, lists: FormLists) {
  return field.options ?? (field.optionsFrom ? (lists[field.optionsFrom] ?? []).map(({ value, label }) => ({ value, label })) : [])
}

// Fills empty top-level fields from prefill keys such as "self.full_name". Fields the user already touched (even cleared) are kept.
export function applyPrefill(definition: FormDefinition, answers: Answers, prefill: Record<string, string>): Answers {
  const filled = { ...answers }
  for (const page of definition.pages) {
    for (const row of page.rows) {
      if (row.type !== 'fields') continue
      for (const field of row.fields) {
        if (field.prefill && filled[field.key] === undefined && prefill[field.prefill] !== undefined) filled[field.key] = prefill[field.prefill]
      }
    }
  }
  return filled
}

// Strips a trailing unit such as "(USD)" and, in English, lowercases the first word unless it is an acronym.
function labelInSentence(label: Text, language: Language) {
  const text = localize(label, language).replace(/\s*\([^)]*\)\s*$/, '').trim()
  return language === 'en' && /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const isQuestion = (label: Text) => /[?؟]$/.test(localize(label).trim())
const count = (value: number) => value.toLocaleString('en-US')

const requiredVerbs: Partial<Record<Field['type'], Record<Language, (name: string) => string>>> = {
  radio: { en: (name) => `Choose an answer for ${name}`, dv: (name) => `${name} ގެ ޖަވާބެއް ހޮއްވަވާ` },
  select: { en: (name) => `Choose ${name}`, dv: (name) => `${name} ހޮއްވަވާ` },
  checkboxGroup: { en: (name) => `Choose at least one option for ${name}`, dv: (name) => `${name} އަށް މަދުވެގެން އެއް އޮޕްޝަން ހޮއްވަވާ` },
  date: { en: (name) => `Enter a date for ${name}`, dv: (name) => `${name} ގެ ތާރީޚު ލިޔުއްވާ` },
  file: { en: (name) => `Upload ${name}`, dv: (name) => `${name} އަޕްލޯޑްކުރޭ` },
}
const enterVerb = { en: (name: string) => `Enter ${name}`, dv: (name: string) => `${name} ލިޔުއްވާ` }

function requiredMessage(field: Field): Text {
  if (isQuestion(field.label)) {
    if (field.type === 'file') return { en: 'Upload the file this question asks for', dv: 'މި ސުވާލުގައި އެދޭ ފައިލް އަޕްލޯޑްކުރޭ' }
    return { en: `Answer this question: ${localize(field.label)}`, dv: `މި ސުވާލަށް ޖަވާބު ދެއްވާ: ${localize(field.label, 'dv')}` }
  }
  if (field.type === 'checkbox') return { en: `Tick the box to confirm: ${localize(field.label)}`, dv: `ޔަގީންކުރުމަށް ބޮކްސްގައި ޓިކް ޖައްސަވާ: ${localize(field.label, 'dv')}` }
  const verbs = requiredVerbs[field.type] ?? enterVerb
  return { en: verbs.en(labelInSentence(field.label, 'en')), dv: verbs.dv(labelInSentence(field.label, 'dv')) }
}

const nidMessage: Text = { en: 'Enter the national ID as the letter A followed by 6 digits, for example A123456', dv: 'އައިޑީ ކާޑު ނަންބަރު ލިޔުއްވާނީ A އަކުރާއި 6 ޑިޖިޓާއެކު، މިސާލަކަށް A123456' }

// Returns the first problem with a visible, editable field's answer in both languages, or null. Lookup and computed fields have nothing to enter.
export function validateField(field: Field, value: unknown, lists: FormLists): Text | null {
  const name = { en: labelInSentence(field.label, 'en'), dv: labelInSentence(field.label, 'dv') }
  const subject = capitalize(name.en)
  if (field.type === 'lookup' || field.type === 'computed') return null

  if (field.type === 'checkbox' && field.mustBeTrue && value !== true) return requiredMessage(field)
  if (isEmptyAnswer(value) || (field.type === 'checkbox' && value === false)) return field.required ? requiredMessage(field) : null

  if (field.type === 'nid' && !nidPattern.test(String(value))) return nidMessage
  if (field.type === 'phone' && !phonePattern.test(String(value))) return { en: 'Enter a 7-digit mobile number that starts with 7 or 9, for example 7712345', dv: '7 ނުވަތަ 9 އިން ފެށޭ 7 ޑިޖިޓްގެ މޯބައިލް ނަންބަރެއް ލިޔުއްވާ، މިސާލަކަށް 7712345' }
  if (field.type === 'email' && !emailPattern.test(String(value))) return { en: 'Enter an email address like name@example.mv', dv: 'name@example.mv ފަދަ އީމެއިލް އެޑްރެހެއް ލިޔުއްވާ' }

  if (field.type === 'number' || field.type === 'amount') {
    const number = Number(value)
    const { min, max } = field
    if (Number.isNaN(number)) return { en: `Enter ${name.en} as a number`, dv: `${name.dv} ލިޔުއްވާނީ ނަންބަރަކުން` }
    if (min !== undefined && number < min) return { en: `${subject} must be at least ${count(min)}`, dv: `${name.dv} ވާންޖެހޭނީ މަދުވެގެން ${count(min)}` }
    if (max !== undefined && number > max) return { en: `${subject} must be at most ${count(max)}`, dv: `${name.dv} ވާންޖެހޭނީ ގިނަވެގެން ${count(max)}` }
  }

  if (typeof value === 'string') {
    const { minLength, maxLength } = field
    if (minLength !== undefined && value.length < minLength) {
      return { en: `${subject} must be at least ${minLength} characters; you entered ${value.length}`, dv: `${name.dv} ގައި މަދުވެގެން ${minLength} އަކުރު ހުންނަން ޖެހޭނެ؛ ތިޔަ ލިޔުއްވީ ${value.length} އަކުރު` }
    }
    if (maxLength !== undefined && value.length > maxLength) {
      return { en: `${subject} must be at most ${maxLength} characters; you entered ${value.length}`, dv: `${name.dv} ގައި ގިނަވެގެން ހުރެވޭނީ ${maxLength} އަކުރު؛ ތިޔަ ލިޔުއްވީ ${value.length} އަކުރު` }
    }
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      return field.type === 'nid' ? nidMessage : { en: `${subject} is not in the expected format`, dv: `${name.dv} ލިޔެފައިވަނީ ބޭނުންވާ ގޮތަށް ނޫން` }
    }
  }

  const options = listOptions(field, lists)
  if ((field.type === 'select' || field.type === 'radio') && options.length > 0 && !options.some((option) => option.value === value)) {
    return { en: `Choose one of the listed options for ${name.en}`, dv: `${name.dv} އަށް ލިސްޓުގައިވާ އޮޕްޝަނެއް ހޮއްވަވާ` }
  }

  if (field.type === 'file' && field.file && Array.isArray(value) && value.length > field.file.maxFiles) {
    const { maxFiles } = field.file
    const extra = value.length - maxFiles
    return { en: `Attach at most ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'} for ${name.en}; remove ${extra}`, dv: `${name.dv} އަށް ލެއްވޭނީ ގިނަވެގެން ${maxFiles} ފައިލް؛ ${extra} ފައިލް ނަގާލައްވާ` }
  }

  return null
}

// Field errors keyed by path for one page; hidden pages, rows and fields are skipped. `scope` limits which paths are checked (correction mode).
export function validatePage(page: Page, state: FormState, scope?: Scope): Record<string, Text> {
  const errors: Record<string, Text> = {}
  const { answers, lookups, lists } = state

  for (const row of visibleRows(page, answers, lookups)) {
    if (row.type !== 'repeated' || row.repeatType !== 'add' || (scope && !scope(row.key))) continue
    const items = repeatedItems(row as RepeatedRow, answers).length
    const minimum = row.minRepeats
    if (minimum && items < minimum) {
      errors[row.key] = { en: `Add at least ${minimum} ${localize(row.itemLabel ?? 'item').toLowerCase()}`, dv: `މަދުވެގެން ${minimum} ${localize(row.itemLabel ?? 'އައިޓަމް', 'dv')} އިތުރުކުރައްވާ` }
    }
  }

  for (const { field, path, value } of visibleFields(page, answers, lookups)) {
    if (field.readOnly || (scope && !scope(path))) continue
    const message = validateField(field, value, lists)
    if (message) errors[path] = message
  }
  return errors
}

export type PageRuleResults = { errors: Record<string, Text>; warnings: Record<string, Text>; endForm: Extract<RuleOutcome, { type: 'endForm' }> | null }

// Business-rule results that belong to a page: results placed on one of its visible fields, or coming from a rule attached to one of them.
export function pageRuleResults(page: Page, state: FormState, outcomes: RuleOutcome[], scope?: Scope): PageRuleResults {
  const paths = new Set(visibleFields(page, state.answers, state.lookups).map((visible) => visible.path))
  const result: PageRuleResults = { errors: {}, warnings: {}, endForm: null }
  for (const outcome of outcomes) {
    const attachedHere = outcome.pageKey === page.key
    if (outcome.type === 'endForm') {
      if (attachedHere && !result.endForm && (!scope || scope(outcome.fieldPath))) result.endForm = outcome
      continue
    }
    if (!(paths.has(outcome.path) || attachedHere) || (scope && !scope(outcome.path))) continue
    const bucket = outcome.type === 'error' ? result.errors : result.warnings
    bucket[outcome.path] ??= outcome.message
  }
  return result
}

export type PageProblems = { page: Page; errors: Record<string, Text>; endForm: PageRuleResults['endForm'] }

// Pages with problems, in order: field errors first, then rule errors. Pages hidden by conditions are not checked. Computed values are filled in here.
export function validateForm(definition: FormDefinition, state: FormState, scope?: Scope): PageProblems[] {
  const answers = computeValues(definition, state.answers, state.today, state.lookups)
  const full = { ...state, answers }
  const outcomes = runRules(definition, full)
  return visiblePages(definition, answers, state.lookups)
    .map((page) => {
      const rules = pageRuleResults(page, full, outcomes, scope)
      return { page, errors: { ...rules.errors, ...validatePage(page, full, scope) }, endForm: rules.endForm }
    })
    .filter((problems) => Object.keys(problems.errors).length > 0 || problems.endForm)
}

// Visible blocking messages on a page; any of them stops the user from continuing.
export function pageBlockers(page: Page, state: Pick<FormState, 'answers' | 'lookups'>, scope?: Scope) {
  const blockers: { path: string; label: Text; text: Text }[] = []
  for (const { field, path, item } of visibleFields(page, state.answers, state.lookups)) {
    if (scope && !scope(path)) continue
    for (const message of visibleMessages(field, { answers: state.answers, lookups: state.lookups, item })) {
      if (message.blocking) blockers.push({ path, label: field.label, text: message.text })
    }
  }
  return blockers
}

export const fieldRows = (page: Page) => page.rows.filter((row) => row.type === 'fields' || row.type === 'repeated')
