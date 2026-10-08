import type { Answers, FormDefinition, FormLists, LookupResult, Lookups, Text } from '../core'
import type { ReactNode } from 'react'
import type { StoredDocument } from './config'

export type { FormLists }

export type FormContext = {
  lists: FormLists
  lookups: Record<string, LookupResult>
  documents: StoredDocument[]
  prefill: Record<string, string>
  // Set when the form belongs to a stored submission: lookups and file uploads are sent to the host with this id. Without it files stay local (previews).
  submissionId?: number | string
  // false while option lists load; renderers wait so nobody sees raw option values
  ready?: boolean
  // The current time as ISO text; AGE, rules and "Saved at" use it. Defaults to the real clock.
  now?: string
}

// A reviewer's request to fix one answer. `by` names who asked, e.g. 'The review team'.
export type FlagInfo = { fieldPath: string; remarks: string; status: 'open' | 'resolved'; by?: string }

// What the wizard hands back with the answers: the lookup results it holds now, keyed by answer path.
export type WizardExtras = { lookups: Lookups }

// A business rule ended the form (e.g. not eligible). The wizard shows the exit screen; the page records the outcome.
export type FormEnd = { outcome: 'not_eligible'; message: Text; ruleId: string }

// Step-by-step wizard for the person filling in the form. editablePaths limits editing to flagged fields during a correction; everything else renders read-only.
export type FormWizardProps = {
  definition: FormDefinition
  answers: Answers
  context: FormContext
  onSubmit: (answers: Answers, extras: WizardExtras) => void | Promise<void>
  onSaveDraft?: (answers: Answers, extras: WizardExtras) => void | Promise<void>
  // When the answers were last saved, shown beside Save draft until the next save.
  savedAt?: string | null
  submitLabel?: string
  editablePaths?: string[]
  flags?: FlagInfo[]
  // Called with the full answers (computed values included) after every change, for live previews.
  onChange?: (answers: Answers) => void
  onEndForm?: (end: FormEnd, answers: Answers) => void
  // Extra actions on the exit screen, such as a link back to the person's submissions.
  endFormActions?: ReactNode
  // Opens on this step instead of the resume step, e.g. from a Change link on Check your answers; ignored when the step is hidden.
  initialPageKey?: string
  // Called when the wizard moves to another step, so a host such as the form designer can follow along.
  onPageChange?: (pageKey: string) => void
}

// Read-only view for reviewers: pages as tabs (or stacked), each field with its answer and an optional flag button.
export type FormViewProps = {
  definition: FormDefinition
  answers: Answers
  context: FormContext
  flags?: FlagInfo[]
  onFlag?: (fieldPath: string, fieldLabel: string) => void
  layout?: 'tabs' | 'stacked'
  compareTo?: Answers
}
