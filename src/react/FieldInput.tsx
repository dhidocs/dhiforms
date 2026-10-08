import type { Field } from '../core'
import { listOptions } from '../core'
import { Checkbox, Group, Input, NumberInput, Progress, Radio, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { Dropzone, type FileRejection } from '@mantine/dropzone'
import { useReducedMotion } from '@mantine/hooks'
import { IconUpload } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useDhiforms } from './config'
import { FileChips, RelatedInfo, resolveFiles } from './display'
import classes from './forms.module.css'
import { useT } from './labels'
import type { FormContext } from './types'
import { useLocalize } from './useLocalize'

// One editable input per field type. Label, help text and error come from Mantine's own wrappers so spacing and focus stay consistent.
export function FieldInput({ field, path, value, onChange, error, context }: { field: Field; path?: string; value: any; onChange: (value: any) => void; error?: string; context: FormContext }) {
  const l = useLocalize()
  const t = useT()
  const { currency } = useDhiforms()
  const label = l(field.label)
  const description = l(field.help) || undefined
  const placeholder = l(field.placeholder) || undefined
  const common = { label, description, error, withAsterisk: field.required }
  const options = listOptions(field, context.lists).map((option) => ({ value: option.value, label: l(option.label) }))

  if (field.type === 'textarea') {
    return <Textarea {...common} value={value ?? ''} placeholder={placeholder} maxLength={field.maxLength} autosize minRows={3} onChange={(event) => onChange(event.currentTarget.value)} />
  }

  if (field.type === 'number' || field.type === 'amount') {
    const isAmount = field.type === 'amount'
    return (
      <NumberInput
        {...common}
        value={value ?? ''}
        placeholder={placeholder}
        hideControls
        allowNegative={false}
        allowDecimal={isAmount}
        decimalScale={isAmount ? 2 : 0}
        thousandSeparator={isAmount ? ',' : undefined}
        leftSection={isAmount && currency ? <Text size="xs" c="dimmed">{currency}</Text> : undefined}
        leftSectionWidth={isAmount && currency ? 48 : undefined}
        inputMode="decimal"
        onChange={(next) => onChange(next === '' ? undefined : next)}
      />
    )
  }

  if (field.type === 'date') {
    return <DateInput {...common} value={value ?? null} placeholder={placeholder ?? t('wizard.pickDate')} valueFormat="D MMM YYYY" clearable onChange={(next) => onChange(next ?? undefined)} />
  }

  if (field.type === 'radio') {
    return (
      <Radio.Group {...common} value={value ?? ''} onChange={onChange}>
        <div className={options.every((option) => option.label.length <= 16) ? classes.optionRow : classes.optionStack}>
          {options.map((option) => (
            <Radio.Card key={option.value} value={option.value} className={classes.optionCard}>
              <Group wrap="nowrap" align="flex-start" gap="sm">
                <Radio.Indicator mt={2} />
                <Text size="md">{option.label}</Text>
              </Group>
            </Radio.Card>
          ))}
        </div>
      </Radio.Group>
    )
  }

  if (field.type === 'select') {
    return (
      <>
        <Select
          {...common}
          data={options}
          value={value ?? null}
          placeholder={placeholder ?? t('wizard.chooseOne')}
          searchable={options.length > 7}
          nothingFoundMessage="No option matches. Check the spelling or clear the search."
          allowDeselect={false}
          onChange={(next) => onChange(next ?? undefined)}
        />
        <RelatedInfo field={field} value={value} context={context} />
      </>
    )
  }

  if (field.type === 'checkbox') {
    return <Checkbox label={label} description={description} error={error} checked={value === true} onChange={(event) => onChange(event.currentTarget.checked)} />
  }

  if (field.type === 'checkboxGroup') {
    return (
      <Checkbox.Group {...common} value={value ?? []} onChange={onChange}>
        <Stack gap="xs" mt="xs">
          {options.map((option) => (
            <Checkbox key={option.value} value={option.value} label={option.label} />
          ))}
        </Stack>
      </Checkbox.Group>
    )
  }

  if (field.type === 'nid') {
    return <TextInput {...common} value={value ?? ''} placeholder={placeholder ?? 'A123456'} maxLength={7} autoComplete="off" onChange={(event) => onChange(event.currentTarget.value.toUpperCase().trim())} />
  }

  if (field.type === 'phone') {
    return (
      <TextInput
        {...common}
        value={value ?? ''}
        placeholder={placeholder ?? '7712345'}
        inputMode="tel"
        maxLength={7}
        leftSection={<Text size="xs" c="dimmed">+960</Text>}
        leftSectionWidth={52}
        onChange={(event) => onChange(event.currentTarget.value.replace(/\D/g, ''))}
      />
    )
  }

  if (field.type === 'email') {
    return <TextInput {...common} type="email" value={value ?? ''} placeholder={placeholder ?? 'name@example.com'} autoComplete="email" onChange={(event) => onChange(event.currentTarget.value.trim())} />
  }

  if (field.type === 'file') return <FileField field={field} path={path ?? field.key} value={value} onChange={onChange} error={error} context={context} />

  return <TextInput {...common} dir={field.dir} value={value ?? ''} placeholder={placeholder} maxLength={field.maxLength} onChange={(event) => onChange(event.currentTarget.value)} />
}

const mimeByExtension = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const acceptedList = (extensions: string[]) => extensions.map((extension) => extension.toUpperCase()).join(', ')

// With an uploadFile callback and a submissionId, each file is uploaded through the host and the answer keeps the document ids.
// Otherwise (previews, the designer's Live view) nothing is uploaded; each picked file shows about 0.9 s of progress and is kept as { name, size }.
function FileField({ field, path, value, onChange, error, context }: { field: Field; path: string; value: any; onChange: (value: any) => void; error?: string; context: FormContext }) {
  const l = useLocalize()
  const t = useT()
  const [rejections, setRejections] = useState<string[]>([])
  const [uploading, setUploading] = useState<{ names: string[]; percent: number } | null>(null)
  const rules = field.file ?? { accept: ['pdf'], maxSizeMb: 10, maxFiles: 1 }
  const stored: any[] = Array.isArray(value) ? value : []
  const remaining = rules.maxFiles - stored.length
  const latest = useRef({ stored, onChange })
  latest.current = { stored, onChange }
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])
  const reduceMotion = useReducedMotion()
  const { uploadFile, deleteFile, fileUrl } = useDhiforms()
  const uploads = uploadFile !== undefined && context.submissionId !== undefined
  const [uploaded, setUploaded] = useState<FormContext['documents']>([])
  const knownDocuments = { ...context, documents: [...context.documents, ...uploaded] }

  const uploadFiles = async (files: File[]) => {
    setRejections([])
    const ids: number[] = []
    for (const file of files) {
      setUploading({ names: [file.name], percent: 0 })
      try {
        const document = await uploadFile!({ file, fieldPath: path, submissionId: context.submissionId, onProgress: (percent) => setUploading({ names: [file.name], percent }) })
        ids.push(document.id)
        setUploaded((previous) => [...previous, document])
      } catch (failure) {
        setRejections((previous) => [...previous, (failure as Error).message])
      }
    }
    setUploading(null)
    if (ids.length) latest.current.onChange([...latest.current.stored, ...ids])
  }

  const removeFile = async (index: number) => {
    const entry = stored[index]
    if (uploads && deleteFile && typeof entry === 'number') {
      try {
        await deleteFile(entry)
      } catch (failure) {
        setRejections([(failure as Error).message])
        return
      }
    }
    onChange(stored.filter((_, position) => position !== index))
  }

  const addFiles = (files: File[]) => {
    if (uploads) return void uploadFiles(files)
    setRejections([])
    const started = performance.now()
    const duration = 900
    setUploading({ names: files.map((file) => file.name), percent: 0 })
    timer.current = window.setInterval(() => {
      const percent = Math.min(100, Math.round(((performance.now() - started) / duration) * 100))
      setUploading({ names: files.map((file) => file.name), percent })
      if (percent < 100) return
      window.clearInterval(timer.current)
      setUploading(null)
      latest.current.onChange([...latest.current.stored, ...files.map((file) => ({ name: file.name, size: file.size }))])
    }, 100)
  }

  const explainRejections = (rejected: FileRejection[]) => {
    const messages = rejected.flatMap(({ file, errors }) =>
      errors.map((rejection) => {
        if (rejection.code === 'file-too-large') return t('wizard.fileTooLarge', { name: file.name, size: (file.size / (1024 * 1024)).toFixed(1), limit: rules.maxSizeMb })
        if (rejection.code === 'file-invalid-type') return t('wizard.fileWrongType', { name: file.name, types: acceptedList(rules.accept) })
        if (rejection.code === 'too-many-files') return t('wizard.tooManyFiles', { count: rules.maxFiles })
        return t('wizard.fileNotAdded', { name: file.name, reason: rejection.message })
      }),
    )
    setRejections([...new Set(messages)])
  }

  return (
    <Input.Wrapper label={l(field.label)} description={l(field.help) || undefined} error={error} withAsterisk={field.required}>
      <div className={classes.fileSlot}>
        {stored.length > 0 && <FileChips files={resolveFiles(stored, knownDocuments, fileUrl)} onRemove={(index) => void removeFile(index)} />}
        {uploading ? (
          <Stack gap={6} aria-live="polite">
            {uploading.names.map((name) => (
              <div key={name}>
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="sm" truncate>{t('wizard.uploading', { name })}</Text>
                  <Text size="sm" c="dimmed" className="df-tabular">{uploading.percent}%</Text>
                </Group>
                <Progress value={uploading.percent} size="sm" transitionDuration={reduceMotion ? 0 : 100} aria-label={t('wizard.uploading', { name })} />
              </div>
            ))}
          </Stack>
        ) : remaining > 0 ? (
          <Dropzone
            onDrop={addFiles}
            onReject={explainRejections}
            accept={rules.accept.map((extension) => mimeByExtension[extension] ?? extension)}
            maxSize={rules.maxSizeMb * 1024 * 1024}
            maxFiles={remaining}
            multiple={remaining > 1}
            inputProps={{ 'aria-label': l(field.label) }}
            className={classes.dropzone}
          >
            <Group gap="sm" wrap="nowrap">
              <IconUpload size={20} stroke={1.6} aria-hidden />
              <div>
                <Text size="md">{remaining > 1 ? t('wizard.dropFiles') : t('wizard.dropFile')}</Text>
                <Text size="sm" c="dimmed">
                  {t(rules.maxFiles > 1 ? 'wizard.fileLimitsCount' : 'wizard.fileLimits', { types: acceptedList(rules.accept), size: rules.maxSizeMb, count: rules.maxFiles })}
                </Text>
              </div>
            </Group>
          </Dropzone>
        ) : (
          <Text size="sm" c="dimmed">{t('wizard.filesFull', { count: rules.maxFiles })}</Text>
        )}
        {rejections.map((message) => (
          <Text key={message} size="sm" className={classes.rejection} role="alert">{message}</Text>
        ))}
      </div>
    </Input.Wrapper>
  )
}
