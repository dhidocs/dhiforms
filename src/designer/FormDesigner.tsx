import { assignIds, buildChangeRequest, diffDefinitions, implementedRules, listBusinessRules, localize, needsDeveloper, type DefinitionChange, type FormDefinition, type FormStatus } from '../core'
import { Alert, Anchor, Button, Group, Text, Title } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconArrowBackUp, IconCheck, IconChevronLeft, IconCopy, IconDeviceDesktop, IconPlus } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useDhiforms } from '../react/config'
import { useT } from '../react/labels'
import { Canvas } from './Canvas'
import { DesignerDnd } from './dnd'
import { ChangeRequestModal, ExportModal, ImportModal, copyJson } from './JsonModals'
import { findIssues, type Issue } from './model'
import { Palette } from './Palette'
import { Properties } from './Properties'
import { replaceDefinition, useDesigner } from './store'
import { TopBar } from './TopBar'
import type { DesignerRecord, SaveRequest } from './types'
import classes from './designer.module.css'

const readOnlyNotes = {
  draft: null,
  awaiting_dev: 'designer.readOnlyAwaitingDev',
  published: 'designer.readOnlyPublished',
  archived: 'designer.readOnlyArchived',
} as const

export type FormDesignerProps = {
  // The version being edited. Only a draft is editable; other statuses open read-only.
  record: DesignerRecord
  // Every stored version of this form (same key). The latest published one before `record` is the baseline publishing compares against. Defaults to [record].
  versions?: DesignerRecord[]
  // Stores the working definition with its new status and resolves with the stored record. Throw an Error whose message says what failed; the designer shows it.
  onSave: (request: SaveRequest) => Promise<DesignerRecord>
  onBack?: () => void
  backLabel?: string
  // Creates the next draft version from the latest published one. Without it the "New version" button is hidden.
  onNewVersion?: () => void | Promise<void>
  // Opens another version, e.g. the existing draft when viewing a published version.
  onOpenVersion?: (record: DesignerRecord) => void
}

// The form designer: palette, canvas with design/static/live/json views and the property panel. Remounts when another record is passed.
export function FormDesigner(props: FormDesignerProps) {
  return <Designer key={props.record.id} {...props} />
}

function Designer({ record: initial, versions = [initial], onSave, onBack, backLabel, onNewVersion, onOpenVersion }: FormDesignerProps) {
  const t = useT()
  const { connectors = [] } = useDhiforms()
  const isWide = useMediaQuery('(min-width: 1000px)', true)

  const definition = useDesigner((state) => state.definition)
  const canUndo = useDesigner((state) => state.past.length > 0)
  const [exportOpened, exporter] = useDisclosure(false)
  const [importOpened, importer] = useDisclosure(false)
  const [changeRequestOpened, changeRequester] = useDisclosure(false)
  const [saving, setSaving] = useState<FormStatus | null>(null)
  const [creatingVersion, setCreatingVersion] = useState(false)

  // The record is the last saved copy; the store holds the working copy.
  // Older definitions get ids derived from their keys, so loading never counts as a change.
  const [loaded] = useState(() => assignIds(initial.definition))
  const savedRecord = useRef(initial)
  const savedJson = useRef(JSON.stringify(loaded))
  const [ready, setReady] = useState(false)
  useEffect(() => {
    useDesigner.getState().load(structuredClone(loaded))
    setReady(true)
  }, [loaded])

  const record = savedRecord.current
  const readOnly = record.status !== 'draft'
  const readOnlyNote = readOnlyNotes[record.status]
  const dirty = JSON.stringify(definition) !== savedJson.current
  const issues = findIssues(definition, connectors)
  const back = backLabel ?? t('designer.formsTitle')

  // Changes are reviewed against the latest published version before this one; a first version has none, so it always goes to the developer.
  const baselineRecord = versions.filter((form) => form.key === record.key && form.status === 'published' && form.version < record.version).sort((a, b) => b.version - a.version)[0]
  const baseline = baselineRecord ? assignIds(baselineRecord.definition) : null
  const baselineJson = baseline ? JSON.stringify(baseline) : null
  useEffect(() => {
    useDesigner.getState().setBaseline(baselineJson ? JSON.parse(baselineJson) : null)
  }, [baselineJson])
  const changes: DefinitionChange[] = baseline ? diffDefinitions(baseline, definition) : []
  const forDeveloper = baseline === null || needsDeveloper(changes)
  const ruleListing = listBusinessRules(definition, implementedRules())
  const unimplemented = ruleListing.filter((listing) => !listing.implemented)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    const undoOnShortcut = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)
      if (!typing && !readOnly && (event.metaKey || event.ctrlKey) && event.key === 'z') {
        event.preventDefault()
        useDesigner.getState().undo()
      }
    }
    window.addEventListener('keydown', undoOnShortcut)
    return () => window.removeEventListener('keydown', undoOnShortcut)
  }, [readOnly])

  const savedMessages: Record<FormStatus, (version: number) => string> = {
    draft: (version) => (record.status === 'awaiting_dev' ? t('designer.backInDraft', { version }) : t('designer.draftSaved')),
    awaiting_dev: (version) => t('designer.sentToDeveloper', { version }),
    published: (version) => t('designer.publishedToast', { version }),
    archived: (version) => t('designer.archivedToast', { version }),
  }

  const save = async (status: FormStatus, developerApproved = false) => {
    setSaving(status)
    try {
      const saved = await onSave({ status, definition, title: localize(definition.title), developerApproved })
      savedRecord.current = saved
      savedJson.current = JSON.stringify(assignIds(saved.definition))
      notifications.show({ color: 'green', message: savedMessages[saved.status](saved.version) })
    } catch (failure) {
      notifications.show({ color: 'red', title: t('designer.notSaved'), message: t('designer.failureContactAdmin', { reason: (failure as Error).message }) })
    } finally {
      setSaving(null)
    }
  }

  const createVersion = async () => {
    setCreatingVersion(true)
    try {
      await onNewVersion?.()
    } catch (failure) {
      notifications.show({ color: 'red', title: t('designer.notSaved'), message: t('designer.failureContactAdmin', { reason: (failure as Error).message }) })
    } finally {
      setCreatingVersion(false)
    }
  }

  const jumpToIssue = (issue: Issue) => {
    useDesigner.getState().setPage(issue.page)
    useDesigner.getState().select(issue.selection)
  }

  const goBack = () => {
    if (!onBack) return
    if (!dirty) return onBack()
    modals.openConfirmModal({
      title: t('designer.leaveTitle'),
      children: <Text size="sm">{t('designer.leaveText')}</Text>,
      labels: { confirm: t('designer.leaveConfirm'), cancel: t('designer.leaveCancel') },
      confirmProps: { color: 'red' },
      onConfirm: onBack,
    })
  }

  const publish = () => {
    if (issues.length > 0) {
      modals.open({
        title: issues.length === 1 ? t('designer.problemsBeforePublishOne') : t('designer.problemsBeforePublish', { count: issues.length }),
        children: (
          <ul className={classes.errorList}>
            {issues.slice(0, 12).map((issue, index) => <li key={index}>{issue.message}</li>)}
          </ul>
        ),
      })
      return
    }
    if (forDeveloper) {
      const developerChanges = changes.filter((change) => !change.cosmetic)
      modals.openConfirmModal({
        title: t('designer.sendTitle', { version: definition.version }),
        size: 'lg',
        children: (
          <>
            <Text size="sm">{baseline ? t('designer.sendChangedText') : t('designer.sendFirstText')}</Text>
            {developerChanges.length > 0 && (
              <>
                <Text size="sm" fw={600} mt="sm">{t('designer.changesForDeveloper')}</Text>
                <ul className={classes.errorList}>
                  {developerChanges.slice(0, 12).map((change) => <li key={`${change.id}-${change.summary}`}>{change.summary}</li>)}
                </ul>
                {developerChanges.length > 12 && <Text size="sm">{t('designer.andMoreInRequest', { count: developerChanges.length - 12 })}</Text>}
              </>
            )}
            {unimplemented.length > 0 && <Text size="sm" mt="sm">{unimplemented.length === 1 ? t('designer.rulesToImplementOne') : t('designer.rulesToImplement', { count: unimplemented.length })}</Text>}
          </>
        ),
        labels: { confirm: t('designer.sendToDeveloper'), cancel: t('designer.keepEditing') },
        onConfirm: () => save('awaiting_dev'),
      })
      return
    }
    modals.openConfirmModal({
      title: t('designer.publishTitle', { version: definition.version }),
      size: 'lg',
      children: (
        <>
          <Text size="sm">
            {changes.length === 0 ? t('designer.publishNoChanges') : t('designer.publishWordingOnly')} {t('designer.publishImmutable')}
          </Text>
          {changes.length > 0 && (
            <ul className={classes.errorList}>
              {changes.slice(0, 12).map((change) => <li key={`${change.id}-${change.summary}`}>{change.summary}</li>)}
            </ul>
          )}
        </>
      ),
      labels: { confirm: t('designer.publishVersion'), cancel: t('designer.keepEditing') },
      onConfirm: () => save('published'),
    })
  }

  const approveAndPublish = () =>
    modals.openConfirmModal({
      title: t('designer.approveTitle', { version: definition.version }),
      children: <Text size="sm">{t('designer.approveText')}</Text>,
      labels: { confirm: t('designer.approveAndPublish'), cancel: t('action.cancel') },
      onConfirm: () => save('published', true),
    })

  const latestOfKey = (statuses: FormStatus[]) => versions.filter((form) => form.key === record.key && statuses.includes(form.status)).sort((a, b) => b.version - a.version)[0]
  const existingDraft = latestOfKey(['draft', 'awaiting_dev'])
  const isLatestPublished = latestOfKey(['published'])?.id === record.id
  const unimplementedIds = unimplemented.map((listing) => listing.rule.id).join(', ')
  const unimplementedText = unimplemented.length === 1 ? t('designer.approveBlockedOne', { ids: unimplementedIds }) : t('designer.approveBlocked', { count: unimplemented.length, ids: unimplementedIds })

  const readOnlyAction =
    record.status === 'awaiting_dev' ? (
      <Group gap="xs" wrap="nowrap">
        {unimplemented.length > 0 && <Text size="xs" c="dimmed" id="approve-blocked" maw={260}>{unimplementedText}</Text>}
        <Button variant="default" leftSection={<IconArrowBackUp size={16} />} loading={saving === 'draft'} onClick={() => save('draft')}>{t('designer.returnToDraft')}</Button>
        <Button leftSection={<IconCheck size={16} />} disabled={unimplemented.length > 0} aria-describedby={unimplemented.length > 0 ? 'approve-blocked' : undefined} loading={saving === 'published'} onClick={approveAndPublish}>{t('designer.approveAndPublish')}</Button>
      </Group>
    ) : existingDraft && existingDraft.id !== record.id && onOpenVersion ? (
      <Button onClick={() => onOpenVersion(existingDraft)}>
        {existingDraft.status === 'awaiting_dev' ? t('designer.openAwaitingVersion', { version: existingDraft.version }) : t('designer.openDraftVersion', { version: existingDraft.version })}
      </Button>
    ) : isLatestPublished && onNewVersion ? (
      <Button leftSection={<IconPlus size={16} />} loading={creatingVersion} onClick={createVersion}>{t('designer.newVersion')}</Button>
    ) : null

  if (!ready) return null

  if (!isWide) {
    const json = JSON.stringify(definition, null, 2)
    return (
      <div className={classes.narrow}>
        {onBack && (
          <Anchor component="button" type="button" size="sm" c="dimmed" className={classes.backLink} onClick={onBack}>
            <IconChevronLeft size={14} stroke={2} />
            {back}
          </Anchor>
        )}
        <Title order={2} mb="md">{localize(definition.title)}</Title>
        <Alert icon={<IconDeviceDesktop size={18} />} color="blue" title={t('designer.narrowTitle')}>
          {t('designer.narrowText')}
        </Alert>
        <Button mt="md" variant="default" leftSection={<IconCopy size={16} />} onClick={() => copyJson(json)}>{t('designer.copyJson')}</Button>
        <pre className={classes.jsonBlock}>{json}</pre>
      </div>
    )
  }

  return (
    <div className={classes.designer}>
      <TopBar
        status={record.status}
        backLabel={back}
        definition={definition}
        issues={issues}
        dirty={dirty}
        canUndo={canUndo}
        saving={saving !== null}
        readOnly={readOnly}
        onBack={onBack ? goBack : undefined}
        onUndo={() => useDesigner.getState().undo()}
        onExport={exporter.open}
        onImport={importer.open}
        onSave={() => save('draft')}
        onPublish={publish}
        onChangeRequest={changeRequester.open}
        publishLabel={forDeveloper ? t('designer.sendToDeveloper') : t('designer.publish')}
        onJumpToIssue={jumpToIssue}
        readOnlyAction={readOnlyAction}
      />

      {readOnlyNote && <div className={classes.readOnlyNote}>{t(readOnlyNote)}</div>}

      <DesignerDnd>
        <div className={classes.body}>
          <Palette readOnly={readOnly} />
          <Canvas readOnly={readOnly} />
          <Properties readOnly={readOnly} />
        </div>
      </DesignerDnd>

      <ExportModal definition={definition} opened={exportOpened} onClose={exporter.close} />
      {changeRequestOpened && <ChangeRequestModal definition={definition} markdown={buildChangeRequest(baseline, definition, implementedRules())} opened onClose={changeRequester.close} />}
      <ImportModal current={definition} opened={importOpened} onClose={importer.close} onImport={(next: FormDefinition) => replaceDefinition(assignIds(next))} />
    </div>
  )
}
