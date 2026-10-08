import type { FormDefinition, FormStatus } from '../core'
import type { Language as LabelLanguage } from '../core'
import { Anchor, Badge, Button, Popover, SegmentedControl, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconArrowBackUp, IconChevronLeft, IconDeviceFloppy, IconDownload, IconFileDescription, IconLanguage, IconUpload } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useT } from '../react/labels'
import type { Issue } from './model'
import { dhivehiOf, englishOf, withTranslation } from './PropertyParts'
import { updateDefinitionTitle, useDesigner } from './store'
import { FormStatusBadge } from './versions'
import classes from './designer.module.css'

type TopBarProps = {
  status: FormStatus
  backLabel: string
  definition: FormDefinition
  issues: Issue[]
  dirty: boolean
  canUndo: boolean
  saving: boolean
  readOnly: boolean
  onBack?: () => void
  onUndo: () => void
  onExport: () => void
  onChangeRequest: () => void
  // "Send to developer" when the draft changes more than wording, else "Publish".
  publishLabel: string
  onImport: () => void
  onSave: () => void
  onPublish: () => void
  onJumpToIssue: (issue: Issue) => void
  readOnlyAction: ReactNode
}

export function TopBar(props: TopBarProps) {
  const { status, definition, issues, dirty, readOnly } = props
  const t = useT()
  const formLanguage = useDesigner((state) => state.formLanguage)
  const setFormLanguage = useDesigner((state) => state.setFormLanguage)

  return (
    <header className={classes.topBar}>
      <div className={classes.topLine}>
        {props.onBack && (
          <Anchor component="button" type="button" size="sm" c="dimmed" className={classes.backLink} onClick={props.onBack}>
            <IconChevronLeft size={14} stroke={2} />
            {props.backLabel}
          </Anchor>
        )}
        <TextInput aria-label={t('designer.formTitleAria')} className={classes.titleInput} variant="unstyled" readOnly={readOnly} value={englishOf(definition.title)} onChange={(event) => updateDefinitionTitle(withTranslation(event.currentTarget.value, dhivehiOf(definition.title)))} />
        <TextInput
          aria-label={t('designer.inDhivehi', { label: t('designer.formTitleAria') })}
          placeholder={t('designer.inDhivehi', { label: t('designer.formTitleAria') })}
          className={classes.titleInput}
          variant="unstyled"
          dir="rtl"
          lang="dv"
          readOnly={readOnly}
          value={dhivehiOf(definition.title)}
          onChange={(event) => updateDefinitionTitle(withTranslation(englishOf(definition.title), event.currentTarget.value))}
        />
        <code className={classes.keyCode}>{definition.key}</code>
        <Badge variant="outline" color="gray">{t('designer.versionNumber', { version: definition.version })}</Badge>
        <FormStatusBadge status={status} />
        {!readOnly && <Text size="sm" className={classes.saveState} data-dirty={dirty}>{dirty ? t('designer.unsavedChanges') : t('designer.allSaved')}</Text>}
      </div>

      <div className={classes.actions}>
        {!readOnly && (
          <>
            <Button variant="subtle" color="gray" leftSection={<IconArrowBackUp size={16} />} onClick={props.onUndo} disabled={!props.canUndo}>{t('designer.undo')}</Button>
            {issues.length > 0 && (
              <Popover width={380} position="bottom-end" withArrow={false}>
                <Popover.Target>
                  <Button variant="subtle" color="yellow" leftSection={<IconAlertTriangle size={16} />}>{issues.length === 1 ? t('designer.problemsToFixOne') : t('designer.problemsToFix', { count: issues.length })}</Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <Text size="sm" mb={8}>{t('designer.problemsBlockPublish')}</Text>
                  <ul className={classes.issueList}>
                    {issues.slice(0, 20).map((issue, index) => (
                      <li key={index}>
                        <button type="button" className={classes.issueButton} onClick={() => props.onJumpToIssue(issue)}>{issue.message}</button>
                      </li>
                    ))}
                  </ul>
                  {issues.length > 20 && <Text size="xs" c="dimmed" mt={6}>{t('designer.andMore', { count: issues.length - 20 })}</Text>}
                </Popover.Dropdown>
              </Popover>
            )}
          </>
        )}
        <div className={classes.formLanguage}>
          <IconLanguage size={16} stroke={1.6} aria-hidden />
          <Text size="sm" id="designer-form-language">{t('designer.formLanguage')}</Text>
          <SegmentedControl
            size="xs"
            aria-labelledby="designer-form-language"
            value={formLanguage}
            onChange={(value) => setFormLanguage(value as LabelLanguage)}
            data={[{ value: 'en', label: 'English' }, { value: 'dv', label: <span lang="dv">ދިވެހި</span> }]}
          />
        </div>
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={props.onExport}>{t('designer.exportJson')}</Button>
        <Button variant="default" leftSection={<IconFileDescription size={16} />} onClick={props.onChangeRequest}>{t('designer.exportChangeRequest')}</Button>
        {!readOnly && <Button variant="default" leftSection={<IconUpload size={16} />} onClick={props.onImport}>{t('designer.importJson')}</Button>}
        {!readOnly && <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={props.onSave} loading={props.saving} disabled={!dirty}>{t('designer.saveDraft')}</Button>}
        {!readOnly && <Button onClick={props.onPublish}>{props.publishLabel}</Button>}
        {readOnly && props.readOnlyAction}
      </div>
    </header>
  )
}
