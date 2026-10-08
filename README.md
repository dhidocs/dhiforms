# dhiforms

Form definitions, a renderer and a visual form designer for React and [Mantine](https://mantine.dev).

A form is plain JSON: **pages → rows → fields**. The same definition drives:

- a step-by-step **wizard** for the person filling it in (conditions, repeated groups, computed fields, lookups to external registries, file uploads, business rules, a "check your answers" step);
- a read-only **view** for reviewers, with per-field flags ("please fix this");
- a drag-and-drop **designer** that edits the definition, previews it live and checks it for problems;
- **validation** you can run again on the server, because the core has no React or DOM dependency.

Every label can be bilingual (`{ en, dv }`: English and Dhivehi, right-to-left Thaana).

| Import | What it holds | Needs |
| --- | --- | --- |
| `dhiforms` | Types, conditions, formulas, validation, business rule registry | nothing (only `lodash-es`) |
| `dhiforms/react` | `DhiformsProvider`, `FormWizard`, `FormView`, `FieldPreview` | React 19, Mantine 9, TanStack Query |
| `dhiforms/designer` | `FormDesigner` | as above |
| `dhiforms/styles.css` | Styles for the renderer and designer | |

## Install

```bash
pnpm add dhiforms
pnpm add react react-dom @mantine/core @mantine/hooks @mantine/dates @mantine/dropzone @mantine/modals @mantine/notifications @tabler/icons-react @tanstack/react-query
```

The React parts expect the host app to provide Mantine, its modals and notifications, and a TanStack Query client:

```tsx
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import 'dhiforms/styles.css'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DhiformsProvider } from 'dhiforms/react'

const queryClient = new QueryClient()

export function App() {
  return (
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <Notifications />
          <DhiformsProvider currency="USD" lists={{ schemes }}>
            <Routes />
          </DhiformsProvider>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
```

## A form definition

```ts
import { assignIds, type FormDefinition } from 'dhiforms'

export const eligibilityForm: FormDefinition = assignIds({
  key: 'financing-eligibility',
  version: 1,
  title: { en: 'Financing scheme eligibility', dv: 'ފައިނޭންސިންގ ސްކީމަށް ޝަރުތު ހަމަވޭތޯ ބެލުން' },
  pages: [
    {
      key: 'income',
      title: 'Income',
      rows: [
        {
          type: 'fields',
          fields: [
            { key: 'scheme', type: 'select', label: 'Scheme', required: true, optionsFrom: 'schemes' },
            { key: 'employment', type: 'radio', label: 'Your work', options: [{ value: 'employed', label: 'Employed' }, { value: 'selfEmployed', label: 'Self-employed' }] },
            { key: 'employer', type: 'text', label: 'Employer', showIf: { field: 'employment', condition: 'equals', value: 'employed' } },
          ],
        },
        {
          type: 'repeated',
          key: 'incomes',
          itemLabel: 'Income',
          repeatType: 'add',
          minRepeats: 1,
          fields: [
            { key: 'source', type: 'text', label: 'Source', required: true },
            { key: 'monthlyAmount', type: 'amount', label: 'Per month', required: true },
          ],
        },
        {
          type: 'fields',
          fields: [
            {
              key: 'totalIncome',
              type: 'computed',
              label: 'Total monthly income',
              format: 'amount',
              formula: { fn: 'SUM', args: ['incomes.monthlyAmount'] },
              businessRules: [{ id: 'br_incomeCap', description: "Household income must be within the scheme's income cap." }],
            },
          ],
        },
      ],
    },
  ],
})
```

`assignIds` gives every page, row and field a stable `id`; the designer does this for you. See `demo/sampleForm.ts` for a fuller financing-scheme eligibility form: income, assets and debts in repeated groups, computed totals, a credit bureau lookup, file uploads, and business rules that end the form, block it or warn.

## Filling in and viewing

```tsx
import { FormView, FormWizard, useFormContext } from 'dhiforms/react'

function Apply() {
  const context = useFormContext({ prefill: { 'self.full_name': user.name } })
  return <FormWizard definition={eligibilityForm} answers={draft} context={context} onSaveDraft={saveDraft} onSubmit={(answers, { lookups }) => submit(answers, lookups)} />
}

function Review() {
  const context = useFormContext({ submissionId: submission.id, lookups: submission.lookups, documents: submission.documents })
  return <FormView definition={eligibilityForm} answers={submission.answers} context={context} flags={flags} onFlag={(path, label) => openFlagDialog(path, label)} />
}
```

`useFormContext(partial)` fills in the option lists from the provider and empty defaults for the rest. Pass `submissionId` once the answers belong to a stored submission. Without it, lookups still run, but file uploads stay in the browser, which suits previews.

Useful `FormWizard` props: `flags` and `editablePaths` for a correction round (only the flagged fields stay editable), `onChange` for live previews, `onEndForm` when a business rule ends the form (for example "not eligible"), and `savedAt` to show when the draft was last saved.

## Designing

```tsx
import { FormDesigner, type DesignerRecord } from 'dhiforms/designer'

<FormDesigner
  record={record} // { id, key, version, status: 'draft' | 'awaiting_dev' | 'published' | 'archived', definition }
  versions={allVersionsOfThisForm}
  onSave={async ({ status, definition, title, developerApproved }) => api.saveForm(record.id, { status, definition })}
  onBack={() => navigate('/forms')}
  onNewVersion={() => api.newVersion(record.key)}
  onOpenVersion={(id) => navigate(`/forms/${id}`)}
/>
```

The designer fills its container, so give the container a height. Publishing a first version, or one with changes beyond wording, saves it as `awaiting_dev` with a change request for a developer. The developer then publishes it, which calls `onSave` with `developerApproved: true`. `onSave` must resolve to the saved record. The designer shows a notification on success and shows the error's message on failure.

## Host configuration

Everything on `DhiformsProvider` is optional. Without a callback, the related feature stays local or is hidden.

| Prop | Purpose |
| --- | --- |
| `language` | `'en'` or `'dv'`: language of the built-in labels (buttons, messages, designer). |
| `labels` | Per-key overrides, e.g. `{ en: { 'wizard.submit': 'Send' } }`. Keys are typed (`LabelKey`). |
| `lists` | Option lists that fields reference with `optionsFrom`, keyed by name. |
| `listLabels` | Names for those lists in the designer. |
| `connectors` | External registries a lookup field can query, described for the designer (inputs and outputs). |
| `runLookup` | `({ connector, inputs, fieldPath, submissionId }) => Promise<LookupResult>`. Runs a lookup field's check. |
| `prefillSources` | `{ value, label }[]` offered in the designer's Prefill select. The values arrive through `context.prefill`. |
| `uploadFile`, `deleteFile`, `fileUrl` | Store files for a submission and link to them. `uploadFile` reports progress through `onProgress`. |
| `currency` | Shown beside amount inputs and amounts, e.g. `'USD'`. |
| `today` | `(now) => 'YYYY-MM-DD'` for `AGE`, `DAYS_BETWEEN` and rules. Defaults to the browser's local date; pass a fixed time zone if your rules depend on it. |

## Business rules

A field can list business rules by id (`businessRules: [{ id, description }]`). The designer lets form authors attach them, and the code that implements them is registered by the host:

```ts
import { registerRule } from 'dhiforms'

registerRule('financing-eligibility', 'br_incomeCap', ({ field, answers, lists }) => {
  const scheme = lists.schemes?.find((option) => option.value === answers.scheme)
  if (!scheme || Number(field.value) <= scheme.meta.incomeCap) return []
  return [{ type: 'error', path: field.path, message: `${scheme.label} is for households earning up to ${scheme.meta.incomeCap} a month.` }]
})
```

A rule returns `error` results (the person must fix the answer), `warning` results (shown, not blocking) or an `endForm` result (for example, not eligible), which ends the wizard on an exit screen. Register rules before a form renders, and register the same ones on the server if you validate there. The designer flags rules that have no implementation.

## Validating on the server

```ts
import { validateForm } from 'dhiforms'

const problems = validateForm(definition, { answers, lookups, lists, today: '2026-10-08' })
if (problems.length > 0) throw new Error('The submission has missing or invalid answers')
```

## Theming

`dhiforms/styles.css` defines `--df-*` tokens on `:root`. Each defaults to a Mantine variable, so the components follow your theme and color scheme. Override any of them:

```css
:root {
  --df-primary: #0b5cad;
  --df-radius-panel: 12px;
}
```

Tokens: `--df-surface`, `--df-paper`, `--df-ink`, `--df-ink-soft`, `--df-line`, `--df-primary`, `--df-warning`, `--df-success`, `--df-danger`, `--df-radius-control`, `--df-radius-panel`, `--df-heading-stretch`.

Fonts are up to the host. For Dhivehi, load a Thaana font and apply it to `[lang="dv"]` or `[dir="rtl"]`.

## Demo

```bash
pnpm install
pnpm demo
```

The demo has three tabs: the designer, the wizard and the submitted-answers view, all for a sample financing-scheme eligibility form.

## Known limits in 0.1

- Built-in `nid` and `phone` field types validate Maldivian formats (`A123456`; 7-digit mobile numbers starting with 7 or 9).
- Built-in labels exist in English and Dhivehi only; other languages need overrides for every key, and form text supports `en` and `dv`.
- A few designer strings are still hardcoded in English.
- The designer keeps its state in one module-level store, so render one `FormDesigner` at a time.

## License

[MIT](LICENSE) © 2026 Dhidocs
