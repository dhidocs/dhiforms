import { isRuleImplemented, localize, newId, type BusinessRule, type Field, type FieldMessage, type FieldType, type FormDefinition, type Formula, type FormulaFn, type Text as FormText } from '../core'
import { ActionIcon, Autocomplete, Badge, Button, Group, NumberInput, Select, SegmentedControl, Slider, Switch, TagsInput, Text, TextInput, Textarea } from '@mantine/core'
import { IconArrowDown, IconArrowLeft, IconArrowRight, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { useDhiforms, type ConnectorInfo } from '../react/config'
import { t, useT, type LabelKey } from '../react/labels'
import { ConditionBuilder } from './ConditionBuilder'
import { allFields, fieldTypeInfo, fieldTypes, formulaFns, formulaInfo, hasOptions, isFieldsRow, keyProblem, type FormLists } from './model'
import { dhivehiOf, englishOf, optionalNumber, Section, TextProperty, withTranslation } from './PropertyParts'
import { SortableItem, SortableList } from './Sortable'
import { moveField, replaceField, shiftFieldToRow, updateField, useDesigner } from './store'
import classes from './designer.module.css'

const toneChoices: { value: string; labelKey: LabelKey }[] = [
  { value: 'info', labelKey: 'designer.toneInfo' },
  { value: 'warning', labelKey: 'designer.toneWarning' },
  { value: 'success', labelKey: 'designer.toneSuccess' },
  { value: 'error', labelKey: 'designer.toneError' },
]

function OptionsEditor({ field, patch, lists }: { field: Field; patch: (change: Partial<Field>) => void; lists: FormLists }) {
  const t = useT()
  const { listLabels = {} } = useDhiforms()
  const usesList = field.optionsFrom !== undefined
  const options = field.options ?? []
  const listChoices = Object.keys(lists).map((type) => ({ value: type, label: localize(listLabels[type]) || type }))
  const related = field.related ?? []
  const metaKeys = (type: string) => [...new Set((lists[type] ?? []).flatMap((item) => Object.keys(item.meta ?? {})))]

  const changeOption = (index: number, change: { value?: string; label?: FormText }) => patch({ options: options.map((option, at) => (at === index ? { ...option, ...change } : option)) })
  const changeRelatedLabel = (index: number, label: FormText) => patch({ related: related.map((entry, at) => (at === index ? { ...entry, label } : entry)) })
  const duplicateValue = (value: string, index: number) => options.some((option, at) => at !== index && option.value === value)

  return (
    <Section title={t('designer.options')}>
      <SegmentedControl
        fullWidth
        size="xs"
        aria-label={t('designer.optionsSourceAria')}
        value={usesList ? 'list' : 'own'}
        onChange={(next) => (next === 'list' ? patch({ optionsFrom: Object.keys(lists)[0] ?? '', options: undefined }) : patch({ optionsFrom: undefined, related: undefined, options: options.length > 0 ? options : [{ value: 'option1', label: t('designer.defaultOption', { number: 1 }) }] }))}
        data={[{ value: 'own', label: t('designer.optionsOwn') }, { value: 'list', label: t('designer.optionsList') }]}
      />

      {!usesList && (
        <>
          <SortableList ids={options.map((_, index) => `option-${index}`)} onReorder={(ids: string[]) => patch({ options: ids.map((id) => options[Number(id.split('-')[1])]) })}>
            {options.map((option, index) => (
              <SortableItem key={`option-${index}`} id={`option-${index}`} className={classes.optionRow}>
                {(handle: any) => (
                  <>
                    {handle}
                    <TextInput aria-label={t('designer.optionLabelAria', { number: index + 1 })} placeholder={t('designer.placeholderLabel')} value={englishOf(option.label)} onChange={(event) => changeOption(index, { label: withTranslation(event.currentTarget.value, dhivehiOf(option.label)) })} />
                    <TextInput
                      aria-label={t('designer.optionValueAria', { number: index + 1 })}
                      placeholder={t('designer.placeholderValue')}
                      value={option.value}
                      error={duplicateValue(option.value, index) ? t('designer.optionValueTwice', { value: option.value }) : undefined}
                      onChange={(event) => changeOption(index, { value: event.currentTarget.value })}
                    />
                    <ActionIcon variant="subtle" color="gray" aria-label={t('designer.removeOption', { number: index + 1 })} onClick={() => patch({ options: options.filter((_, at) => at !== index) })}>
                      <IconTrash size={16} />
                    </ActionIcon>
                    <TextInput
                      className={classes.optionDhivehi}
                      aria-label={t('designer.inDhivehi', { label: t('designer.optionLabelAria', { number: index + 1 }) })}
                      placeholder={t('designer.inDhivehi', { label: t('designer.placeholderLabel') })}
                      dir="rtl"
                      lang="dv"
                      value={dhivehiOf(option.label)}
                      onChange={(event) => changeOption(index, { label: withTranslation(englishOf(option.label), event.currentTarget.value) })}
                    />
                  </>
                )}
              </SortableItem>
            ))}
          </SortableList>
          <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => patch({ options: [...options, { value: `option${options.length + 1}`, label: t('designer.defaultOption', { number: options.length + 1 }) }] })}>
            {t('designer.addOption')}
          </Button>
        </>
      )}

      {usesList && (
        <>
          <Select label={t('designer.list')} searchable allowDeselect={false} data={listChoices} value={field.optionsFrom || null} onChange={(next) => patch({ optionsFrom: next ?? '', related: undefined })} />
          <div>
            <Text size="sm" fw={500}>{t('designer.relatedTitle')}</Text>
            <Text size="xs" c="dimmed" mb={8}>{t('designer.relatedHelp')}</Text>
            {related.map((item, index) => (
              <div key={index} className={classes.relatedRow}>
                <TextInput aria-label={t('designer.relatedLabelAria')} placeholder={t('designer.relatedLabelPlaceholder')} value={englishOf(item.label)} onChange={(event) => changeRelatedLabel(index, withTranslation(event.currentTarget.value, dhivehiOf(item.label)))} />
                <Autocomplete aria-label={t('designer.relatedPropertyAria')} placeholder={t('designer.relatedPropertyPlaceholder')} data={metaKeys(field.optionsFrom ?? '')} value={item.property} onChange={(next) => patch({ related: related.map((entry, at) => (at === index ? { ...entry, property: next } : entry)) })} />
                <ActionIcon variant="subtle" color="gray" aria-label={t('designer.removeRelated')} onClick={() => patch({ related: related.filter((_, at) => at !== index) })}>
                  <IconTrash size={16} />
                </ActionIcon>
                <TextInput
                  className={classes.relatedDhivehi}
                  aria-label={t('designer.inDhivehi', { label: t('designer.relatedLabelAria') })}
                  placeholder={t('designer.inDhivehi', { label: t('designer.relatedLabelPlaceholder') })}
                  dir="rtl"
                  lang="dv"
                  value={dhivehiOf(item.label)}
                  onChange={(event) => changeRelatedLabel(index, withTranslation(englishOf(item.label), event.currentTarget.value))}
                />
              </div>
            ))}
            <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => patch({ related: [...related, { label: '', from: field.optionsFrom ?? '', property: '' }] })}>
              {t('designer.addRelated')}
            </Button>
          </div>
        </>
      )}
    </Section>
  )
}

function LookupEditor({ field, rowIndex, patch, connectors }: { field: Field; rowIndex: number; patch: (change: Partial<Field>) => void; connectors: ConnectorInfo[] }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const page = useDesigner((state) => state.page)
  const connector = connectors.find((item) => item.key === field.connector)
  const row = definition.pages[page].rows[rowIndex]
  const siblings = isFieldsRow(row) ? row.fields.filter((other) => other.key !== field.key) : []
  const sources = [{ value: 'self.nid', label: t('designer.applicantNid') }, ...siblings.map((other) => ({ value: other.key, label: `${localize(other.label)} (${other.key})` }))]

  return (
    <Section title={t('designer.connector')}>
      <Select
        label={t('designer.externalSystem')}
        placeholder={t('designer.chooseConnector')}
        data={connectors.map((item) => ({ value: item.key, label: item.label }))}
        value={field.connector ?? null}
        onChange={(next) => patch({ connector: next ?? undefined, inputs: {} })}
      />
      {connector && (
        <>
          <Text size="sm" c="dimmed">{connector.description}</Text>
          <div>
            <Text size="sm" fw={500} mb={4}>{t('designer.inputMapping')}</Text>
            <div className={classes.mapping}>
              {connector.inputs.map((input) => (
                <div key={input.key} className={classes.mappingRow}>
                  <Text size="sm">{input.label}</Text>
                  <Select aria-label={t('designer.sourceOf', { input: input.label })} placeholder={t('designer.chooseSource')} data={sources} value={field.inputs?.[input.key] ?? null} onChange={(next) => patch({ inputs: { ...field.inputs, [input.key]: next ?? '' } })} />
                </div>
              ))}
            </div>
            <Text size="xs" c="dimmed" mt={6}>{t('designer.sourcesHelp')}</Text>
          </div>
          <Text size="xs" c="dimmed">{t('designer.givesBack', { outputs: connector.outputs.map((output) => output.label).join(', ') })}</Text>
        </>
      )}
    </Section>
  )
}

const dateFunctions: FormulaFn[] = ['AGE', 'DAYS_BETWEEN']

// Fields a formula argument can read: fields outside repeated groups, fields of the same group (read per item), and for SUM the columns of other groups.
function argumentChoices(definition: FormDefinition, field: Field, fn: FormulaFn, scopeRowKey: string | undefined) {
  const wanted = (type: FieldType) => (dateFunctions.includes(fn) ? type === 'date' : type === 'number' || type === 'amount' || type === 'computed')
  return allFields(definition).flatMap((choice) => {
    if (choice.field.key === field.key || !wanted(choice.field.type)) return []
    const group = choice.repeated
    if (!group || group.key === scopeRowKey) return [{ value: choice.field.key, label: `${localize(choice.field.label)} (${choice.field.key})` }]
    if (fn !== 'SUM') return []
    const key = `${group.key}.${choice.field.key}`
    return [{ value: key, label: t('designer.everyItem', { label: localize(choice.field.label), item: localize(group.itemLabel).toLowerCase() || t('designer.item'), key }) }]
  })
}

function FormulaEditor({ field, patch, lists, scopeRowKey }: { field: Field; patch: (change: Partial<Field>) => void; lists: FormLists; scopeRowKey?: string }) {
  const t = useT()
  const definition = useDesigner((state) => state.definition)
  const formula: Formula = field.formula ?? { fn: 'SUM', args: [] }
  const setFormula = (next: Partial<Formula>) => patch({ formula: { ...formula, ...next } })
  const [fewest, most] = formulaInfo[formula.fn].arity
  const groups = [...new Map(allFields(definition).flatMap((choice) => (choice.repeated ? [[choice.repeated.key, choice.repeated] as const] : []))).values()]
  const choices = argumentChoices(definition, field, formula.fn, scopeRowKey)

  const changeFn = (fn: FormulaFn) => {
    const [, nextMost] = formulaInfo[fn].arity
    const args = fn === 'COUNT' ? [groups[0]?.key ?? ''] : formula.fn === 'COUNT' ? [] : formula.args.slice(0, nextMost)
    patch({ formula: { fn, args }, format: fn === 'AGE' || fn === 'DAYS_BETWEEN' || fn === 'COUNT' ? 'number' : field.format })
  }
  const changeArg = (index: number, value: string | number) => setFormula({ args: formula.args.map((arg, at) => (at === index ? value : arg)) })

  return (
    <Section title={t('designer.formula')}>
      <Text size="xs" c="dimmed">{t('designer.formulaHelp')}</Text>
      <Select label={t('designer.function')} allowDeselect={false} data={formulaFns.map((fn) => ({ value: fn, label: formulaInfo[fn].label }))} value={formula.fn} onChange={(next) => changeFn(next as FormulaFn)} />

      {formula.fn === 'COUNT' ? (
        <>
          <Select label={t('designer.groupToCount')} placeholder={t('designer.chooseGroup')} allowDeselect={false} data={groups.map((group) => ({ value: group.key, label: localize(group.label) || group.key }))} value={String(formula.args[0] ?? '') || null} onChange={(next) => patch({ formula: { fn: 'COUNT', args: [next ?? ''] } })} />
          {groups.length === 0 && <Text size="xs" c="dimmed">{t('designer.addGroupFirst')}</Text>}
          {typeof formula.args[0] === 'string' && formula.args[0] !== '' && (
            <div>
              <Text size="sm" fw={500} mb={4}>{t('designer.countOnlyWhere')}</Text>
              <ConditionBuilder single value={formula.where} lists={lists} scopeRowKey={formula.args[0]} emptyText={t('designer.everyItemCounted')} onChange={(next) => setFormula({ where: next ?? undefined })} />
            </div>
          )}
        </>
      ) : (
        <>
          {formula.args.map((arg, index) => (
            <div key={index} className={classes.formulaArg}>
              <SegmentedControl size="xs" aria-label={t('designer.argumentIsAria', { number: index + 1 })} value={typeof arg === 'number' ? 'number' : 'field'} onChange={(next) => changeArg(index, next === 'number' ? 0 : '')} data={[{ value: 'field', label: t('designer.field') }, { value: 'number', label: t('designer.number') }]} />
              {typeof arg === 'number' ? (
                <NumberInput aria-label={t('designer.argumentAria', { number: index + 1 })} value={arg} onChange={(next) => changeArg(index, Number(next) || 0)} />
              ) : (
                <Select aria-label={t('designer.argumentAria', { number: index + 1 })} searchable placeholder={t('designer.chooseField')} data={choices} value={arg || null} onChange={(next) => changeArg(index, next ?? '')} />
              )}
              <ActionIcon variant="subtle" color="gray" aria-label={t('designer.removeArgument', { number: index + 1 })} disabled={formula.args.length <= fewest} onClick={() => setFormula({ args: formula.args.filter((_, at) => at !== index) })}>
                <IconTrash size={16} />
              </ActionIcon>
            </div>
          ))}
          {formula.args.length < most && (
            <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setFormula({ args: [...formula.args, ''] })}>
              {t('designer.addArgument')}
            </Button>
          )}
          {choices.length === 0 && <Text size="xs" c="dimmed">{dateFunctions.includes(formula.fn) ? t('designer.addDateField') : t('designer.addNumberField')}</Text>}
        </>
      )}

      {!dateFunctions.includes(formula.fn) && formula.fn !== 'COUNT' && (
        <SegmentedControl fullWidth size="xs" aria-label={t('designer.showResultAs')} value={field.format ?? 'number'} onChange={(next) => patch({ format: next as Field['format'] })} data={[{ value: 'number', label: t('designer.number') }, { value: 'amount', label: t('designer.typeAmount') }]} />
      )}
    </Section>
  )
}

// Rules the admin describes in words; a developer implements each one in code under its id. Rewording a published rule gives it a new id so the old code is not reused by mistake.
function BusinessRulesEditor({ field, patch }: { field: Field; patch: (change: Partial<Field>) => void }) {
  const t = useT()
  const formKey = useDesigner((state) => state.definition.key)
  const baseline = useDesigner((state) => state.baseline)
  const rules = field.businessRules ?? []
  const published = new Map((baseline ? allFields(baseline) : []).flatMap((choice) => choice.field.businessRules ?? []).map((rule) => [rule.id, rule.description]))

  const reword = (index: number, description: string) => {
    const rule = rules[index]
    const reworded = published.has(rule.id) && published.get(rule.id) !== description
    const next: BusinessRule = { id: reworded ? newId('br') : rule.id, description }
    patch({ businessRules: rules.map((existing, at) => (at === index ? next : existing)) })
  }

  return (
    <Section title={t('designer.businessRules')}>
      <Text size="xs" c="dimmed">{t('designer.businessRulesHelp')}</Text>
      {rules.map((rule, index) => {
        const implemented = isRuleImplemented(formKey, rule.id)
        return (
          <div key={rule.id} className={classes.messageBox}>
            <Group justify="space-between" gap="xs">
              <Badge variant="light" color={implemented ? 'green' : 'yellow'}>{implemented ? t('designer.implemented') : t('designer.requested')}</Badge>
              <Text size="xs" c="dimmed" ff="monospace">{rule.id}</Text>
            </Group>
            <Textarea aria-label={t('designer.businessRuleAria', { number: index + 1 })} placeholder={t('designer.businessRulePlaceholder')} autosize minRows={2} value={rule.description} onChange={(event) => reword(index, event.currentTarget.value)} />
            <div className={classes.messageFoot}>
              <span />
              <Button variant="subtle" color="gray" size="compact-sm" leftSection={<IconTrash size={14} />} onClick={() => patch({ businessRules: rules.filter((_, at) => at !== index) })}>
                {t('designer.removeRule')}
              </Button>
            </div>
          </div>
        )
      })}
      <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => patch({ businessRules: [...rules, { id: newId('br'), description: '' }] })}>
        {t('designer.addBusinessRule')}
      </Button>
    </Section>
  )
}

function PositionEditor({ rowIndex, fieldIndex, rowCount, fieldCount }: { rowIndex: number; fieldIndex: number; rowCount: number; fieldCount: number }) {
  const t = useT()
  const alone = fieldCount === 1
  return (
    <Section title={t('designer.position')}>
      <Text size="xs" c="dimmed">{t('designer.fieldPositionHelp')}</Text>
      <div className={classes.pair}>
        <Button variant="default" size="xs" leftSection={<IconArrowLeft size={14} />} disabled={fieldIndex === 0} onClick={() => moveField(rowIndex, fieldIndex, rowIndex, fieldIndex - 1)}>{t('designer.moveLeft')}</Button>
        <Button variant="default" size="xs" leftSection={<IconArrowRight size={14} />} disabled={fieldIndex === fieldCount - 1} onClick={() => moveField(rowIndex, fieldIndex, rowIndex, fieldIndex + 1)}>{t('designer.moveRight')}</Button>
        <Button variant="default" size="xs" leftSection={<IconArrowUp size={14} />} disabled={rowIndex === 0 && alone} onClick={() => shiftFieldToRow(rowIndex, fieldIndex, -1)}>{t('designer.moveToRowAbove')}</Button>
        <Button variant="default" size="xs" leftSection={<IconArrowDown size={14} />} disabled={rowIndex === rowCount - 1 && alone} onClick={() => shiftFieldToRow(rowIndex, fieldIndex, 1)}>{t('designer.moveToRowBelow')}</Button>
      </div>
    </Section>
  )
}

function MessagesEditor({ field, patch, lists, scopeRowKey }: { field: Field; patch: (change: Partial<Field>) => void; lists: FormLists; scopeRowKey?: string }) {
  const t = useT()
  const messages = field.messages ?? []
  const change = (index: number, next: Partial<FieldMessage>) => patch({ messages: messages.map((message, at) => (at === index ? { ...message, ...next } : message)) })

  return (
    <Section title={t('designer.messages')}>
      <Text size="xs" c="dimmed">{t('designer.messagesHelp')}</Text>
      {messages.map((message, index) => (
        <div key={index} className={classes.messageBox}>
          <ConditionBuilder value={message.when} lists={lists} ownKey={field.key} scopeRowKey={scopeRowKey} emptyText={t('designer.messageWhenEmpty')} onChange={(next) => change(index, { when: next ?? { condition: 'isNotEmpty' } })} />
          <Select aria-label={t('designer.toneAria')} allowDeselect={false} data={toneChoices.map((choice) => ({ value: choice.value, label: t(choice.labelKey) }))} value={message.tone} onChange={(next) => change(index, { tone: next as FieldMessage['tone'] })} />
          <TextProperty label={t('designer.messageTextAria')} placeholder={t('designer.messagePlaceholder')} multiline minRows={2} value={message.text} onChange={(text) => change(index, { text })} />
          <div className={classes.messageFoot}>
            <Switch label={t('designer.blocking')} checked={message.blocking} onChange={(event) => change(index, { blocking: event.currentTarget.checked })} />
            <Button variant="subtle" color="gray" size="compact-sm" leftSection={<IconTrash size={14} />} onClick={() => patch({ messages: messages.filter((_, at) => at !== index) })}>
              {t('designer.removeMessage')}
            </Button>
          </div>
        </div>
      ))}
      <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => patch({ messages: [...messages, { when: { condition: 'isNotEmpty' }, tone: 'info', blocking: false, text: '' }] })}>
        {t('designer.addMessage')}
      </Button>
    </Section>
  )
}

export function FieldProperties({ field, rowIndex, fieldIndex, lists, connectors, onDelete }: { field: Field; rowIndex: number; fieldIndex: number; lists: FormLists; connectors: ConnectorInfo[]; onDelete: () => void }) {
  const t = useT()
  const { prefillSources = [] } = useDhiforms()
  const definition = useDesigner((state) => state.definition)
  const page = useDesigner((state) => state.page)
  const patch = (change: Partial<Field>) => updateField(rowIndex, fieldIndex, change)
  const keyError = keyProblem(definition, field.key, { page, row: rowIndex, field: fieldIndex }) ?? undefined
  const rows = definition.pages[page].rows
  const row = rows[rowIndex]
  const scopeRowKey = row.type === 'repeated' ? row.key : undefined
  const fieldCount = isFieldsRow(row) ? row.fields.length : 1
  const isComputed = field.type === 'computed'

  // Settings that only apply to answered fields are dropped when the type becomes computed, and the formula when it stops being one.
  const changeType = (type: FieldType) => {
    const { required, placeholder, readOnly, prefill, formula, format, ...rest } = field
    const kept = type === 'computed' ? { ...rest, formula: formula ?? { fn: 'SUM' as const, args: [] }, format: format ?? 'number' } : { ...rest, required, placeholder, readOnly, prefill }
    const options = hasOptions(type) && !field.options && !field.optionsFrom ? [{ value: 'option1', label: t('designer.defaultOption', { number: 1 }) }] : field.options
    replaceField(rowIndex, fieldIndex, JSON.parse(JSON.stringify({ ...kept, type, options })))
  }

  const isNumeric = field.type === 'number' || field.type === 'amount'
  const isTextual = field.type === 'text' || field.type === 'textarea'
  const hasPlaceholder = !['checkbox', 'radio', 'checkboxGroup', 'file', 'lookup', 'computed'].includes(field.type)

  return (
    <>
      <Section title={t('designer.field')}>
        <TextProperty label={t('designer.labelLabel')} description={t('designer.fieldLabelHelp')} value={field.label} onChange={(label) => patch({ label })} />
        <TextInput label={t('designer.labelKey')} description={t('designer.fieldKeyHelp')} value={field.key} error={keyError} onChange={(event) => patch({ key: event.currentTarget.value })} />
        <Select label={t('designer.labelType')} allowDeselect={false} data={fieldTypes.map((type: FieldType) => ({ value: type, label: fieldTypeInfo[type].label }))} value={field.type} onChange={(next) => changeType(next as FieldType)} />
        <TextProperty label={t('designer.helpText')} description={t('designer.helpTextHelp')} value={field.help} onChange={(help) => patch({ help: help || undefined })} />
        {hasPlaceholder && <TextProperty label={t('designer.placeholder')} value={field.placeholder} onChange={(placeholder) => patch({ placeholder: placeholder || undefined })} />}
        {!isComputed && (
          <>
            <Switch label={t('designer.required')} checked={field.required ?? false} onChange={(event) => patch({ required: event.currentTarget.checked || undefined })} />
            <Switch label={t('designer.readOnly')} description={t('designer.readOnlyHelp')} checked={field.readOnly ?? false} onChange={(event) => patch({ readOnly: event.currentTarget.checked || undefined })} />
            {prefillSources.length > 0 && <Select label={t('designer.prefill')} clearable placeholder={t('designer.noPrefill')} data={prefillSources.map((source) => ({ value: source.value, label: localize(source.label) }))} value={field.prefill ?? null} onChange={(next) => patch({ prefill: next ?? undefined })} />}
          </>
        )}
        <div>
          <div className={classes.widthHead}>
            <Text size="sm" fw={500}>{t('designer.width')}</Text>
            <Text size="xs" c="dimmed">{field.width ? t('designer.widthOf', { width: field.width }) : t('designer.widthAuto')}</Text>
          </div>
          <Slider min={1} max={12} step={1} marks={[{ value: 1 }, { value: 6 }, { value: 12 }]} aria-label={t('designer.width')} value={field.width ?? 12} onChange={(next) => patch({ width: next })} />
          {field.width !== undefined && (
            <Button variant="subtle" color="gray" size="compact-xs" mt={6} onClick={() => patch({ width: undefined })}>{t('designer.useAutoWidth')}</Button>
          )}
        </div>
      </Section>

      {hasOptions(field.type) && <OptionsEditor field={field} patch={patch} lists={lists} />}
      {field.type === 'lookup' && <LookupEditor field={field} rowIndex={rowIndex} patch={patch} connectors={connectors} />}
      {isComputed && <FormulaEditor field={field} patch={patch} lists={lists} scopeRowKey={scopeRowKey} />}

      {(isNumeric || isTextual || field.type === 'phone' || field.type === 'email' || field.type === 'nid' || field.type === 'checkbox' || field.type === 'file') && (
        <Section title={t('designer.limits')}>
          {isNumeric && (
            <div className={classes.pair}>
              <NumberInput label={t('designer.smallestAllowed')} value={field.min ?? ''} onChange={(next) => patch({ min: optionalNumber(next) })} />
              <NumberInput label={t('designer.largestAllowed')} value={field.max ?? ''} onChange={(next) => patch({ max: optionalNumber(next) })} />
            </div>
          )}
          {isTextual && (
            <>
              <div className={classes.pair}>
                <NumberInput label={t('designer.fewestChars')} min={0} value={field.minLength ?? ''} onChange={(next) => patch({ minLength: optionalNumber(next) })} />
                <NumberInput label={t('designer.mostChars')} min={0} value={field.maxLength ?? ''} onChange={(next) => patch({ maxLength: optionalNumber(next) })} />
              </div>
              {field.type === 'text' && <TextInput label={t('designer.pattern')} description={t('designer.patternHelp')} value={field.pattern ?? ''} onChange={(event) => patch({ pattern: event.currentTarget.value || undefined })} />}
            </>
          )}
          {field.type === 'checkbox' && <Switch label={t('designer.mustBeTicked')} description={t('designer.mustBeTickedHelp')} checked={field.mustBeTrue ?? false} onChange={(event) => patch({ mustBeTrue: event.currentTarget.checked || undefined })} />}
          {field.type === 'file' && (
            <>
              <TagsInput label={t('designer.acceptedTypes')} description={t('designer.acceptedTypesHelp')} value={field.file?.accept ?? []} onChange={(accept) => patch({ file: { maxSizeMb: 5, maxFiles: 1, ...field.file, accept } })} />
              <div className={classes.pair}>
                <NumberInput label={t('designer.largestFile')} min={1} value={field.file?.maxSizeMb ?? 5} onChange={(next) => patch({ file: { accept: [], maxFiles: 1, ...field.file, maxSizeMb: Number(next) || 1 } })} />
                <NumberInput label={t('designer.mostFiles')} min={1} value={field.file?.maxFiles ?? 1} onChange={(next) => patch({ file: { accept: [], maxSizeMb: 5, ...field.file, maxFiles: Number(next) || 1 } })} />
              </div>
            </>
          )}
          {(field.type === 'phone' || field.type === 'email' || field.type === 'nid') && <Text size="sm" c="dimmed">{t('designer.formatChecked')}</Text>}
        </Section>
      )}

      <Section title={t('designer.shownWhenSection')}>
        <ConditionBuilder value={field.showIf} lists={lists} scopeRowKey={scopeRowKey} emptyText={t('designer.fieldAlwaysShown')} onChange={(next) => patch({ showIf: next })} />
      </Section>

      <MessagesEditor field={field} patch={patch} lists={lists} scopeRowKey={scopeRowKey} />
      <BusinessRulesEditor field={field} patch={patch} />
      <PositionEditor rowIndex={rowIndex} fieldIndex={fieldIndex} rowCount={rows.length} fieldCount={fieldCount} />

      <Section title={t('designer.delete')}>
        <Button variant="default" leftSection={<IconTrash size={16} />} onClick={onDelete}>{t('designer.deleteField')}</Button>
      </Section>
    </>
  )
}
