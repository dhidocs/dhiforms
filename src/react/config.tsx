import { createContext, useContext, type ReactNode } from 'react'
import { localToday, type FormLists, type Language, type LookupResult, type Text } from '../core'
import { setLabelSource, UiLanguageContext, type LabelOverrides } from './labels'

// An external system a lookup field can query, as the host describes it to the designer.
export type ConnectorInfo = { key: string; label: string; description: string; inputs: { key: string; label: string }[]; outputs: { key: string; label: string }[] }

// A file the host stored for a submission; file answers keep its id.
export type StoredDocument = { id: number; fieldPath: string; fileName: string; sizeBytes: number; mimeType: string; uploadedAt: string }

export type LookupRequest = { connector: string; inputs: Record<string, string>; fieldPath: string; submissionId?: number | string }

export type UploadRequest = { file: File; fieldPath: string; submissionId?: number | string; onProgress: (percent: number) => void }

// Everything dhiforms needs from the host app. All of it is optional; without a callback the related feature stays local (see README).
export type DhiformsConfig = {
  // Language of the renderer's and designer's own labels.
  language?: Language
  labels?: LabelOverrides
  // Option lists that fields reference with optionsFrom, keyed by list name.
  lists?: FormLists
  // Names shown for those lists in the designer; the list key is shown when missing.
  listLabels?: Record<string, Text>
  connectors?: ConnectorInfo[]
  // Values a field can be prefilled from (Field.prefill), e.g. the signed-in person's name. The values arrive in FormContext.prefill.
  prefillSources?: { value: string; label: Text }[]
  runLookup?: (request: LookupRequest) => Promise<LookupResult>
  uploadFile?: (request: UploadRequest) => Promise<StoredDocument>
  deleteFile?: (id: number) => Promise<void>
  fileUrl?: (id: number) => string | undefined
  // Shown beside amount inputs and before amounts, e.g. 'USD'. Left out, amounts show as plain numbers.
  currency?: string
  // Today's date as YYYY-MM-DD for AGE, DAYS_BETWEEN and rules. Defaults to the browser's local date.
  today?: (now: Date) => string
}

type ResolvedConfig = Omit<DhiformsConfig, 'language' | 'labels'> & { today: (now: Date) => string }

const ConfigContext = createContext<ResolvedConfig>({ today: localToday })

export function useDhiforms() {
  return useContext(ConfigContext)
}

export function DhiformsProvider({ children, language = 'en', labels = {}, today = localToday, ...rest }: DhiformsConfig & { children: ReactNode }) {
  setLabelSource(language, labels)
  return (
    <UiLanguageContext.Provider value={language}>
      <ConfigContext.Provider value={{ ...rest, today }}>{children}</ConfigContext.Provider>
    </UiLanguageContext.Provider>
  )
}
