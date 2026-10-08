import type { FormDefinition } from '../core'
import { Alert, Button, Group, Modal, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconCopy, IconDownload } from '@tabler/icons-react'
import { useState } from 'react'
import { t, useT } from '../react/labels'
import { checkDefinitionShape } from './model'
import classes from './designer.module.css'

export function copyJson(json: string, copiedMessage = t('designer.jsonCopied')) {
  navigator.clipboard.writeText(json).then(
    () => notifications.show({ color: 'green', message: copiedMessage }),
    () => notifications.show({ color: 'red', message: t('designer.copyBlocked') }),
  )
}

function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function ExportModal({ definition, opened, onClose }: { definition: FormDefinition; opened: boolean; onClose: () => void }) {
  const json = JSON.stringify(definition, null, 2)
  const t = useT()
  const download = () => downloadText(json, `${definition.key}-v${definition.version}.json`, 'application/json')

  return (
    <Modal opened={opened} onClose={onClose} title={t('designer.exportJson')} size="lg">
      <pre className={classes.jsonBlock}>{json}</pre>
      <Group mt="md">
        <Button leftSection={<IconDownload size={16} />} onClick={download}>{t('designer.downloadFile')}</Button>
        <Button variant="default" leftSection={<IconCopy size={16} />} onClick={() => copyJson(json)}>{t('designer.copy')}</Button>
      </Group>
    </Modal>
  )
}

// The bundle a developer works from: the changes since the last published version, the rules to implement and the definition.
export function ChangeRequestModal({ definition, markdown, opened, onClose }: { definition: FormDefinition; markdown: string; opened: boolean; onClose: () => void }) {
  const t = useT()
  return (
    <Modal opened={opened} onClose={onClose} title={t('designer.changeRequestTitle')} size="xl">
      <Text size="sm" c="dimmed" mb="sm">{t('designer.changeRequestIntro')}</Text>
      <pre className={classes.jsonBlock}>{markdown}</pre>
      <Group mt="md">
        <Button leftSection={<IconDownload size={16} />} onClick={() => downloadText(markdown, `${definition.key}-v${definition.version}-change-request.md`, 'text/markdown')}>{t('designer.downloadFile')}</Button>
        <Button variant="default" leftSection={<IconCopy size={16} />} onClick={() => copyJson(markdown, t('designer.changeRequestCopied'))}>{t('designer.copy')}</Button>
      </Group>
    </Modal>
  )
}

export function ImportModal({ current, opened, onClose, onImport }: { current: FormDefinition; opened: boolean; onClose: () => void; onImport: (definition: FormDefinition) => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const close = () => {
    setText('')
    setErrors([])
    onClose()
  }

  const submit = () => {
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      setErrors([t('designer.notJson', { error: (error as Error).message })])
      return
    }
    const found = checkDefinitionShape(parsed)
    if (found.length > 0) {
      setErrors(found)
      return
    }
    // The key and version stay those of this form; everything else is replaced.
    onImport({ ...parsed, key: current.key, version: current.version })
    notifications.show({ color: 'green', message: t('designer.imported') })
    close()
  }

  return (
    <Modal opened={opened} onClose={close} title={t('designer.importJson')} size="lg">
      <Text size="sm" c="dimmed" mb="sm">{t('designer.importIntro')}</Text>
      <Textarea aria-label={t('designer.importAria')} placeholder='{ "title": "...", "pages": [ ... ] }' autosize minRows={10} maxRows={18} className={classes.jsonInput} value={text} onChange={(event) => { setText(event.currentTarget.value); setErrors([]) }} data-autofocus />
      {errors.length > 0 && (
        <Alert color="red" mt="sm" title={errors.length === 1 ? t('designer.problemsBeforeImportOne') : t('designer.problemsBeforeImport', { count: errors.length })}>
          <ul className={classes.errorList}>
            {errors.slice(0, 12).map((error) => <li key={error}>{error}</li>)}
          </ul>
          {errors.length > 12 && <Text size="sm">{t('designer.andMore', { count: errors.length - 12 })}</Text>}
        </Alert>
      )}
      <Group mt="md">
        <Button leftSection={<IconCheck size={16} />} onClick={submit} disabled={text.trim() === ''}>{t('designer.import')}</Button>
        <Button variant="default" onClick={close}>{t('action.cancel')}</Button>
      </Group>
    </Modal>
  )
}
