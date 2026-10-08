import type { FormDefinition, FormStatus } from '../core'

// One stored version of a form, as the host keeps it. A published version is immutable; changes start as a draft in the next version number.
export type DesignerRecord = { id: number | string; key: string; version: number; status: FormStatus; definition: FormDefinition }

// What the designer asks the host to store: the working definition with its new status. developerApproved is set when a developer approves an awaiting_dev draft.
export type SaveRequest = { status: FormStatus; definition: FormDefinition; title: string; developerApproved: boolean }
