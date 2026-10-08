import { cloneDeep, difference, intersection, isEqual, uniq, xor } from 'lodash-es'
import { localize } from './text'
import type { BusinessRule, Field, FormDefinition, Page, Row, Text } from './types'

// A random id for a new page, row, field or business rule. Ids never change, so versions are compared by id (§4.9).
export const newId = (prefix: 'p' | 'r' | 'f' | 'br') => `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`

// Gives every page, row and field without an id one derived from its key (or position), so older definitions get the same ids every time.
export function assignIds(definition: FormDefinition): FormDefinition {
  const copy = cloneDeep(definition)
  const taken = new Set<string>()
  copy.pages.forEach((page) => {
    if (page.id) taken.add(page.id)
    page.rows.forEach((row) => {
      if (row.id) taken.add(row.id)
      if ('fields' in row) row.fields.forEach((field) => field.id && taken.add(field.id))
    })
  })
  const claim = (base: string) => {
    let id = base
    for (let counter = 2; taken.has(id); counter++) id = `${base}_${counter}`
    taken.add(id)
    return id
  }
  copy.pages.forEach((page) => {
    page.id ??= claim(`p_${page.key}`)
    page.rows.forEach((row, rowIndex) => {
      row.id ??= claim(row.type === 'repeated' ? `r_${row.key}` : `r_${page.key}_${rowIndex + 1}`)
      if (!('fields' in row)) return
      row.fields.forEach((field) => {
        field.id ??= claim(row.type === 'repeated' ? `f_${row.key}_${field.key}` : `f_${field.key}`)
      })
    })
  })
  return copy
}

export type ChangeTarget = 'form' | 'page' | 'row' | 'field' | 'rule'

// One difference between two versions. `cosmetic` changes can be published by the admin; the rest need a developer.
export type DefinitionChange = { target: ChangeTarget; kind: 'added' | 'removed' | 'changed' | 'moved'; id: string; summary: string; cosmetic: boolean }

const cosmeticPageProperties = ['title', 'description']
const cosmeticRowProperties = ['text', 'label', 'itemLabel']
const cosmeticFieldProperties = ['label', 'help', 'placeholder', 'width', 'related', 'format']

type FieldPlace = { field: Field; page: Page; row: Row; position: number }
type RowPlace = { row: Row; page: Page; position: number }

function locate(definition: FormDefinition) {
  const pages = new Map<string, Page>()
  const rows = new Map<string, RowPlace>()
  const fields = new Map<string, FieldPlace>()
  definition.pages.forEach((page) => {
    pages.set(page.id!, page)
    page.rows.forEach((row, rowIndex) => {
      rows.set(row.id!, { row, page, position: rowIndex })
      if ('fields' in row) row.fields.forEach((field, position) => fields.set(field.id!, { field, page, row, position }))
    })
  })
  return { pages, rows, fields }
}

const isTranslated = (value: unknown): value is Exclude<Text, string> => typeof value === 'object' && value !== null && typeof (value as any).en === 'string'

const show = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 'nothing'
  const text = typeof value === 'string' ? `'${value}'` : isTranslated(value) ? `'${value.en}'${value.dv ? ` (Dhivehi '${value.dv}')` : ''}` : JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

// "label changed from ... to ...", or "Dhivehi label ..." when only the translation changed.
const propertyChange = (property: string, before: unknown, after: unknown) => {
  const isText = (value: unknown): value is Text => typeof value === 'string' || isTranslated(value)
  const dhivehi = (value: Text) => (typeof value === 'string' ? undefined : value.dv)
  if (isText(before) && isText(after) && localize(before) === localize(after)) return `Dhivehi ${property} changed from ${show(dhivehi(before))} to ${show(dhivehi(after))}`
  return `${property} changed from ${show(before)} to ${show(after)}`
}

const fieldName = (field: Field) => `Field '${localize(field.label)}' (${field.key})`
const pageName = (page: Page) => `'${localize(page.title)}'`
const rowName = (row: Row, page: Page) => (row.type === 'repeated' ? `Repeated group '${row.label ? localize(row.label) : row.key}'` : `A ${row.type} row`) + ` on page ${pageName(page)}`

// Property-by-property differences of two objects, skipping the keys handled elsewhere.
function propertyChanges(before: Record<string, any>, after: Record<string, any>, skip: string[]) {
  const keys = uniq([...Object.keys(before), ...Object.keys(after)]).filter((key) => !skip.includes(key))
  return keys.filter((key) => !isEqual(before[key] ?? null, after[key] ?? null))
}

function optionChanges(before: Field, after: Field, name: string): DefinitionChange[] {
  const id = after.id!
  const previous = before.options ?? []
  const next = after.options ?? []
  const changes: DefinitionChange[] = []
  const valuesChanged = xor(previous.map((option) => option.value), next.map((option) => option.value))
  if (valuesChanged.length > 0) {
    changes.push({ target: 'field', kind: 'changed', id, cosmetic: false, summary: `${name}: option values changed (${valuesChanged.join(', ')} added or removed)` })
  }
  const relabelled = next.filter((option) => previous.some((old) => old.value === option.value && !isEqual(old.label, option.label)))
  if (relabelled.length > 0) changes.push({ target: 'field', kind: 'changed', id, cosmetic: true, summary: `${name}: option labels changed for ${relabelled.map((option) => option.value).join(', ')}` })
  const common = intersection(next.map((option) => option.value), previous.map((option) => option.value))
  const orderBefore = previous.map((option) => option.value).filter((value) => common.includes(value))
  if (!isEqual(orderBefore, common)) changes.push({ target: 'field', kind: 'moved', id, cosmetic: true, summary: `${name}: options reordered` })
  return changes
}

function messageChanges(before: Field, after: Field, name: string): DefinitionChange[] {
  const previous = before.messages ?? []
  const next = after.messages ?? []
  if (isEqual(previous, next)) return []
  const textOnly = previous.length === next.length && next.every((message, index) => isEqual({ ...message, text: '' }, { ...previous[index], text: '' }))
  return [{ target: 'field', kind: 'changed', id: after.id!, cosmetic: textOnly, summary: textOnly ? `${name}: message text changed` : `${name}: messages changed (when they show, tone or blocking)` }]
}

function ruleChanges(before: Field | undefined, after: Field | undefined): DefinitionChange[] {
  const previous: BusinessRule[] = before?.businessRules ?? []
  const next: BusinessRule[] = after?.businessRules ?? []
  const owner = after ?? before!
  const changes: DefinitionChange[] = []
  for (const rule of next) {
    const old = previous.find((candidate) => candidate.id === rule.id)
    if (!old) changes.push({ target: 'rule', kind: 'added', id: rule.id, cosmetic: false, summary: `Business rule ${rule.id} added to ${fieldName(owner)}: ${rule.description}` })
    else if (old.description !== rule.description) changes.push({ target: 'rule', kind: 'changed', id: rule.id, cosmetic: false, summary: `Business rule ${rule.id} on ${fieldName(owner)} reworded: ${rule.description}` })
  }
  for (const rule of previous.filter((candidate) => !next.some((kept) => kept.id === candidate.id))) {
    changes.push({ target: 'rule', kind: 'removed', id: rule.id, cosmetic: false, summary: `Business rule ${rule.id} removed from ${fieldName(owner)}` })
  }
  return changes
}

// Order changes among the items both versions share, per container, reported once per container.
function orderChange<T extends { id?: string }>(previous: T[], next: T[]) {
  const nextIds = next.map((item) => item.id!)
  const shared = intersection(nextIds, previous.map((item) => item.id!))
  return !isEqual(previous.map((item) => item.id!).filter((id) => shared.includes(id)), shared)
}

// Compares two versions by id (never by position or key). Ids are assigned first, so definitions without ids compare by key.
export function diffDefinitions(previousDefinition: FormDefinition, nextDefinition: FormDefinition): DefinitionChange[] {
  const prev = assignIds(previousDefinition)
  const next = assignIds(nextDefinition)
  const before = locate(prev)
  const after = locate(next)
  const changes: DefinitionChange[] = []

  if (!isEqual(prev.title, next.title)) changes.push({ target: 'form', kind: 'changed', id: next.key, cosmetic: true, summary: `Form ${propertyChange('title', prev.title, next.title)}` })
  if (orderChange(prev.pages, next.pages)) changes.push({ target: 'form', kind: 'moved', id: next.key, cosmetic: true, summary: 'Pages reordered' })

  for (const [id, page] of after.pages) {
    const old = before.pages.get(id)
    if (!old) {
      changes.push({ target: 'page', kind: 'added', id, cosmetic: false, summary: `Page ${pageName(page)} added` })
      continue
    }
    for (const property of propertyChanges(old, page, ['id', 'rows'])) {
      changes.push({ target: 'page', kind: 'changed', id, cosmetic: cosmeticPageProperties.includes(property), summary: `Page ${pageName(page)}: ${propertyChange(property, (old as any)[property], (page as any)[property])}` })
    }
    if (orderChange(old.rows, page.rows)) changes.push({ target: 'page', kind: 'moved', id, cosmetic: true, summary: `Page ${pageName(page)}: rows reordered` })
  }
  for (const [id, page] of before.pages) if (!after.pages.has(id)) changes.push({ target: 'page', kind: 'removed', id, cosmetic: false, summary: `Page ${pageName(page)} removed` })

  for (const [id, { row, page }] of after.rows) {
    const old = before.rows.get(id)
    if (!old) {
      changes.push({ target: 'row', kind: 'added', id, cosmetic: row.type !== 'repeated', summary: `${rowName(row, page)} added` })
      continue
    }
    for (const property of propertyChanges(old.row, row, ['id', 'fields'])) {
      changes.push({ target: 'row', kind: 'changed', id, cosmetic: cosmeticRowProperties.includes(property), summary: `${rowName(row, page)}: ${propertyChange(property, (old.row as any)[property], (row as any)[property])}` })
    }
    if (old.page.id !== page.id) changes.push({ target: 'row', kind: 'moved', id, cosmetic: true, summary: `${rowName(row, page)}: moved from page ${pageName(old.page)}` })
    if ('fields' in row && 'fields' in old.row && orderChange(old.row.fields, row.fields)) changes.push({ target: 'row', kind: 'moved', id, cosmetic: true, summary: `${rowName(row, page)}: fields reordered` })
  }
  for (const [id, { row, page }] of before.rows) {
    if (!after.rows.has(id)) changes.push({ target: 'row', kind: 'removed', id, cosmetic: row.type !== 'repeated', summary: `${rowName(row, page)} removed` })
  }

  for (const [id, { field, row }] of after.fields) {
    const old = before.fields.get(id)
    if (!old) {
      changes.push({ target: 'field', kind: 'added', id, cosmetic: false, summary: `${fieldName(field)} added` }, ...ruleChanges(undefined, field))
      continue
    }
    const name = fieldName(field)
    for (const property of propertyChanges(old.field, field, ['id', 'options', 'messages', 'businessRules'])) {
      changes.push({ target: 'field', kind: 'changed', id, cosmetic: cosmeticFieldProperties.includes(property), summary: `${name}: ${propertyChange(property, (old.field as any)[property], (field as any)[property])}` })
    }
    changes.push(...optionChanges(old.field, field, name), ...messageChanges(old.field, field, name), ...ruleChanges(old.field, field))
    const wasRepeated = old.row.type === 'repeated' ? old.row.id : null
    const isRepeated = row.type === 'repeated' ? row.id : null
    if (wasRepeated !== isRepeated) changes.push({ target: 'field', kind: 'moved', id, cosmetic: false, summary: `${name}: moved into or out of a repeated group, which changes how its answer is stored` })
    else if (old.row.id !== row.id) changes.push({ target: 'field', kind: 'moved', id, cosmetic: true, summary: `${name}: moved to another row` })
  }
  for (const [id, { field }] of before.fields) {
    if (!after.fields.has(id)) changes.push({ target: 'field', kind: 'removed', id, cosmetic: false, summary: `${fieldName(field)} removed` }, ...ruleChanges(field, undefined))
  }
  return changes
}

export const needsDeveloper = (changes: DefinitionChange[]) => changes.some((change) => !change.cosmetic)

export type RuleListing = { rule: BusinessRule; field: Field; pageTitle: Text; repeatedKey?: string; implemented: boolean }

// Every business rule in a definition with the field it is attached to; `implemented` lists registry keys "<formKey>/<ruleId>".
export function listBusinessRules(definition: FormDefinition, implemented: string[]): RuleListing[] {
  return definition.pages.flatMap((page) =>
    page.rows.flatMap((row) =>
      'fields' in row
        ? row.fields.flatMap((field) =>
            (field.businessRules ?? []).map((rule) => ({
              rule,
              field,
              pageTitle: page.title,
              repeatedKey: row.type === 'repeated' ? row.key : undefined,
              implemented: implemented.includes(`${definition.key}/${rule.id}`),
            })),
          )
        : [],
    ),
  )
}

const bullet = (lines: string[], empty: string) => (lines.length === 0 ? `- ${empty}` : lines.map((line) => `- ${line}`).join('\n'))

// The bundle a developer (or a coding agent) works from: the diff, the rules still to implement, and the whole definition.
export function buildChangeRequest(previous: FormDefinition | null, next: FormDefinition, implemented: string[]): string {
  const changes = previous ? diffDefinitions(previous, next) : []
  const rules = listBusinessRules(next, implemented)
  const requested = rules.filter((listing) => !listing.implemented)
  const lookups = next.pages.flatMap((page) =>
    page.rows.flatMap((row) => ('fields' in row ? row.fields.filter((field) => field.type === 'lookup').map((field) => ({ field, path: row.type === 'repeated' ? `${row.key}[i].${field.key}` : field.key })) : [])),
  )
  const developerChanges = changes.filter((change) => !change.cosmetic)
  const cosmeticChanges = difference(changes, developerChanges)

  const requestedSections = requested.map(({ rule, field, pageTitle, repeatedKey }) =>
    [
      `### ${rule.id} on \`${field.key}\` (${localize(field.label)}), page ${localize(pageTitle)}`,
      '',
      `> ${rule.description}`,
      '',
      `- Register with \`registerRule('${next.key}', '${rule.id}', fn)\` in \`packages/forms/src/rules/\`.`,
      repeatedKey ? `- Runs once per item of \`${repeatedKey}\`; the field path is \`${repeatedKey}[i].${field.key}\`.` : `- The field path is \`${field.key}\`.`,
      `- The rule receives \`{ answers, lookups, lists, today, field }\` and returns error, warning or endForm results.`,
    ].join('\n'),
  )

  return [
    `# Change request: ${localize(next.title)}, version ${next.version}`,
    '',
    `Form key \`${next.key}\`. ${previous ? `Compared with published version ${previous.version}.` : 'This is the first version of the form.'}`,
    '',
    '## Summary',
    '',
    `- ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}, ${developerChanges.length} of them ${developerChanges.length === 1 ? 'needs' : 'need'} a developer.`,
    `- ${requested.length} business ${requested.length === 1 ? 'rule' : 'rules'} to implement, ${rules.length - requested.length} already implemented.`,
    '',
    '## Changes that need a developer',
    '',
    bullet(developerChanges.map((change) => change.summary), previous ? 'None.' : 'The whole form is new.'),
    '',
    '## Cosmetic changes',
    '',
    bullet(cosmeticChanges.map((change) => change.summary), 'None.'),
    '',
    '## Business rules to implement',
    '',
    requestedSections.length > 0 ? requestedSections.join('\n\n') : 'None. Every rule in this version is implemented.',
    '',
    '## Lookup fields available to rules',
    '',
    bullet(lookups.map(({ field, path }) => `\`${field.key}\` (${localize(field.label)}): connector \`${field.connector ?? 'not set'}\`, read as \`lookups['${path}']\``), 'None.'),
    '',
    '## Definition',
    '',
    '```json',
    JSON.stringify(next, null, 2),
    '```',
    '',
  ].join('\n')
}
