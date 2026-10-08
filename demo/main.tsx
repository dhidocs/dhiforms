import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import { MantineProvider, SegmentedControl } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Answers } from '../src/core'
import { FormDesigner, type DesignerRecord } from '../src/designer'
import { DhiformsProvider, FormView, FormWizard, useFormContext, type ConnectorInfo, type LookupRequest } from '../src/react'
import { sampleForm, schemes } from './sampleForm'

const connectors: ConnectorInfo[] = [
  { key: 'credit-bureau', label: 'Credit bureau', description: 'Looks up the applicant\'s credit record.', inputs: [{ key: 'idNumber', label: 'ID or passport number' }], outputs: [{ key: 'rating', label: 'Rating' }, { key: 'openLoans', label: 'Open loans' }] },
]

// Stand-in for a real credit bureau: ID numbers ending in 0 have no record, the rest are found.
async function runLookup({ inputs }: LookupRequest) {
  await new Promise((resolve) => setTimeout(resolve, 600))
  const found = !(inputs.idNumber ?? '').trim().endsWith('0')
  return { status: found ? 'found' : 'not_found', checkedAt: new Date().toISOString(), data: found ? { rating: 'Good', openLoans: 1 } : undefined } as const
}

function Demo() {
  const [view, setView] = useState('designer')
  const [versions, setVersions] = useState<DesignerRecord[]>([{ id: 1, key: sampleForm.key, version: 1, status: 'draft', definition: sampleForm }])
  const [submitted, setSubmitted] = useState<Answers | null>(null)
  const current = versions[versions.length - 1]
  const context = useFormContext({ prefill: { 'self.full_name': 'Aminath Ali' } })

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100dvh' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <SegmentedControl value={view} onChange={(next) => setView(String(next))} data={[{ value: 'designer', label: 'Designer' }, { value: 'wizard', label: 'Fill in' }, { value: 'view', label: 'Submitted answers' }]} />
      </div>
      <div style={{ minHeight: 0, overflow: 'auto' }}>
        {view === 'designer' && (
          <FormDesigner
            record={current}
            versions={versions}
            onSave={async ({ status, definition }) => {
              const saved = { ...current, status, definition }
              setVersions((previous) => [...previous.slice(0, -1), saved])
              return saved
            }}
            onNewVersion={() => setVersions((previous) => [...previous, { ...current, id: current.id as number + 1, version: current.version + 1, status: 'draft', definition: { ...current.definition, version: current.version + 1 } }])}
          />
        )}
        {view === 'wizard' && (
          <div style={{ maxWidth: 760, margin: '24px auto', padding: '0 16px' }}>
            <FormWizard definition={current.definition} answers={submitted ?? {}} context={context} onSubmit={(answers) => { setSubmitted(answers); setView('view') }} />
          </div>
        )}
        {view === 'view' && (
          <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px' }}>
            <FormView definition={current.definition} answers={submitted ?? {}} context={context} />
          </div>
        )}
      </div>
    </div>
  )
}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <Notifications />
          <DhiformsProvider
            lists={{ schemes }}
            listLabels={{ schemes: 'Financing schemes' }}
            currency="USD"
            connectors={connectors}
            runLookup={runLookup}
            prefillSources={[{ value: 'self.full_name', label: 'Signed-in person: full name' }]}
          >
            <Demo />
          </DhiformsProvider>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
)
