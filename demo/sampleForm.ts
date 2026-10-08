import { assignIds, registerRule, type FormDefinition, type FormLists, type RuleFn } from '../src/core'

// An eligibility check for a financing scheme that touches most features: conditions, field messages, repeated groups,
// computed totals, a lookup, file uploads, and business rules that end the form, block it or warn.
export const sampleForm: FormDefinition = assignIds({
  key: 'financing-eligibility',
  version: 1,
  title: { en: 'Financing scheme eligibility', dv: 'ފައިނޭންސިންގ ސްކީމަށް ޝަރުތު ހަމަވޭތޯ ބެލުން' },
  pages: [
    {
      key: 'applicant',
      title: { en: 'About you', dv: 'ތިޔަބޭފުޅާގެ މަޢުލޫމާތު' },
      rows: [
        { type: 'heading', text: 'Who is applying' },
        {
          type: 'fields',
          fields: [
            { key: 'fullName', type: 'text', label: { en: 'Full name', dv: 'ފުރިހަމަ ނަން' }, required: true, prefill: 'self.full_name' },
            { key: 'idNumber', type: 'text', label: 'ID or passport number', required: true, minLength: 5, maxLength: 20 },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'dateOfBirth', type: 'date', label: 'Date of birth', required: true },
            { key: 'age', type: 'computed', label: 'Age', formula: { fn: 'AGE', args: ['dateOfBirth'] }, businessRules: [{ id: 'br_minAge', description: 'Applicants must be 18 or older; younger applicants cannot continue.' }] },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'email', type: 'email', label: 'Email', required: true },
            { key: 'householdSize', type: 'number', label: 'People in your household', help: 'Count yourself and everyone who lives with you and shares the costs.', required: true, min: 1, max: 20 },
          ],
        },
      ],
    },
    {
      key: 'scheme',
      title: 'The financing',
      rows: [
        {
          type: 'fields',
          fields: [
            {
              key: 'scheme',
              type: 'select',
              label: 'Scheme',
              required: true,
              optionsFrom: 'schemes',
              related: [
                { label: 'Financing up to', from: 'schemes', property: 'maxAmountText' },
                { label: 'Household income up to', from: 'schemes', property: 'incomeCapText' },
              ],
            },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'requestedAmount', type: 'amount', label: 'Amount you need', required: true, min: 1_000, businessRules: [{ id: 'br_maxAmount', description: 'The amount must not be more than the scheme allows.' }] },
            { key: 'termYears', type: 'number', label: 'Repay over (years)', required: true, min: 1, max: 25 },
          ],
        },
        { type: 'fields', fields: [{ key: 'purpose', type: 'textarea', label: 'What is the financing for?', help: 'Two or three sentences are enough.', required: true, maxLength: 600 }] },
      ],
    },
    {
      key: 'income',
      title: { en: 'Income', dv: 'އާމްދަނީ' },
      rows: [
        {
          type: 'fields',
          fields: [
            {
              key: 'employment',
              type: 'radio',
              label: 'Your work',
              required: true,
              options: [
                { value: 'employed', label: 'Employed' },
                { value: 'selfEmployed', label: 'Self-employed' },
                { value: 'notWorking', label: 'Not working' },
                { value: 'retired', label: 'Retired' },
              ],
              messages: [{ when: { condition: 'equals', value: 'notWorking' }, tone: 'info', blocking: false, text: 'You can still apply if your household has other income, such as rent, a pension or a partner\'s salary.' }],
            },
            { key: 'employer', type: 'text', label: 'Employer', required: true, showIf: { field: 'employment', condition: 'equals', value: 'employed' } },
            { key: 'businessName', type: 'text', label: 'Business name', required: true, showIf: { field: 'employment', condition: 'equals', value: 'selfEmployed' } },
          ],
        },
        {
          type: 'repeated',
          key: 'incomes',
          label: 'Monthly household income',
          itemLabel: 'Income',
          repeatType: 'add',
          minRepeats: 1,
          maxRepeats: 8,
          fields: [
            { key: 'source', type: 'select', label: 'Source', required: true, options: [{ value: 'salary', label: 'Salary or wages' }, { value: 'business', label: 'Business' }, { value: 'rent', label: 'Rent' }, { value: 'pension', label: 'Pension' }, { value: 'benefit', label: 'Allowance or benefit' }, { value: 'other', label: 'Other' }] },
            { key: 'monthlyAmount', type: 'amount', label: 'Per month', required: true, min: 0 },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'totalIncome', type: 'computed', label: 'Total monthly income', format: 'amount', formula: { fn: 'SUM', args: ['incomes.monthlyAmount'] }, businessRules: [{ id: 'br_incomeCap', description: 'Household income must be within the chosen scheme\'s income cap.' }] },
          ],
        },
      ],
    },
    {
      key: 'wealth',
      title: { en: 'Assets and debts', dv: 'މުދަލާއި ދަރަނި' },
      rows: [
        { type: 'paragraph', text: 'List what your household owns and owes. Use today\'s value, as near as you can tell.' },
        {
          type: 'repeated',
          key: 'assets',
          label: 'What you own',
          itemLabel: 'Asset',
          repeatType: 'add',
          minRepeats: 0,
          maxRepeats: 10,
          fields: [
            { key: 'kind', type: 'select', label: 'Kind', required: true, options: [{ value: 'property', label: 'Property or land' }, { value: 'vehicle', label: 'Vehicle or vessel' }, { value: 'savings', label: 'Savings' }, { value: 'investments', label: 'Shares or investments' }, { value: 'business', label: 'Business' }, { value: 'other', label: 'Other' }] },
            { key: 'description', type: 'text', label: 'Description', maxLength: 80 },
            { key: 'value', type: 'amount', label: 'Value', required: true, min: 0 },
          ],
        },
        {
          type: 'fields',
          fields: [{ key: 'hasDebts', type: 'radio', label: 'Does your household have loans or other debts?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }],
        },
        {
          type: 'repeated',
          key: 'debts',
          label: 'What you owe',
          itemLabel: 'Debt',
          repeatType: 'add',
          minRepeats: 1,
          maxRepeats: 10,
          showIf: { field: 'hasDebts', condition: 'equals', value: 'yes' },
          fields: [
            { key: 'lender', type: 'text', label: 'Lender', required: true },
            { key: 'balance', type: 'amount', label: 'Still owed', required: true, min: 0 },
            { key: 'monthlyRepayment', type: 'amount', label: 'Repayment per month', required: true, min: 0 },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'totalAssets', type: 'computed', label: 'Total assets', format: 'amount', formula: { fn: 'SUM', args: ['assets.value'] } },
            { key: 'totalDebts', type: 'computed', label: 'Total debts', format: 'amount', formula: { fn: 'SUM', args: ['debts.balance'] } },
            { key: 'netWorth', type: 'computed', label: 'Net worth', format: 'amount', formula: { fn: 'DIFFERENCE', args: ['totalAssets', 'totalDebts'] } },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'totalRepayments', type: 'computed', label: 'Repayments per month', format: 'amount', formula: { fn: 'SUM', args: ['debts.monthlyRepayment'] }, businessRules: [{ id: 'br_repaymentShare', description: 'Warn when existing repayments take more than 40% of monthly income.' }] },
          ],
        },
        { type: 'subheading', text: 'Credit check' },
        { type: 'fields', fields: [{ key: 'creditCheck', type: 'lookup', label: 'Credit bureau record', connector: 'credit-bureau', inputs: { idNumber: 'idNumber' } }] },
      ],
    },
    {
      key: 'documents',
      title: 'Documents',
      rows: [
        { type: 'paragraph', text: 'Attach clear scans or photos.' },
        {
          type: 'fields',
          fields: [
            { key: 'idCopy', type: 'file', label: 'Copy of your ID or passport', required: true, file: { accept: ['pdf', 'png', 'jpg'], maxSizeMb: 5, maxFiles: 2 } },
            { key: 'incomeProof', type: 'file', label: 'Proof of income', help: 'Recent payslips, bank statements or business accounts.', required: true, file: { accept: ['pdf', 'png', 'jpg'], maxSizeMb: 10, maxFiles: 6 } },
          ],
        },
        { type: 'fields', fields: [{ key: 'declaration', type: 'checkbox', label: 'The information I gave is true and complete', mustBeTrue: true }] },
      ],
    },
  ],
})

export const schemes: FormLists[string] = [
  { value: 'home', label: 'Home financing', meta: { maxAmount: 250_000, maxAmountText: '250,000', incomeCap: 6_000, incomeCapText: '6,000 a month' } },
  { value: 'business', label: 'Small business financing', meta: { maxAmount: 100_000, maxAmountText: '100,000', incomeCap: 10_000, incomeCapText: '10,000 a month' } },
  { value: 'education', label: 'Education financing', meta: { maxAmount: 40_000, maxAmountText: '40,000', incomeCap: 4_000, incomeCapText: '4,000 a month' } },
]

const chosenScheme = (answers: Record<string, unknown>, lists: FormLists) => lists.schemes?.find((scheme) => scheme.value === answers.scheme)

const minAge: RuleFn = ({ field }) =>
  field.value !== null && Number(field.value) < 18 ? [{ type: 'endForm', outcome: 'not_eligible', message: 'You must be 18 or older to apply for a financing scheme.' }] : []

const maxAmount: RuleFn = ({ field, answers, lists }) => {
  const scheme = chosenScheme(answers, lists)
  if (!scheme || Number(field.value) <= scheme.meta.maxAmount) return []
  return [{ type: 'error', path: field.path, message: `${scheme.label} goes up to ${scheme.meta.maxAmountText}. Lower the amount or choose another scheme.` }]
}

const incomeCap: RuleFn = ({ field, answers, lists }) => {
  const scheme = chosenScheme(answers, lists)
  if (!scheme || field.value === null || Number(field.value) <= scheme.meta.incomeCap) return []
  return [{ type: 'error', path: field.path, message: `${scheme.label} is for households earning up to ${scheme.meta.incomeCapText}. Check the amounts, or go back and choose another scheme.` }]
}

const repaymentShare: RuleFn = ({ field, answers }) => {
  const income = Number(answers.totalIncome)
  if (!income || Number(field.value) <= income * 0.4) return []
  return [{ type: 'warning', path: field.path, message: 'Existing repayments take more than 40% of your monthly income, so the application may be turned down.' }]
}

// Business rules are plain functions registered under the form key and rule id.
registerRule('financing-eligibility', 'br_minAge', minAge)
registerRule('financing-eligibility', 'br_maxAmount', maxAmount)
registerRule('financing-eligibility', 'br_incomeCap', incomeCap)
registerRule('financing-eligibility', 'br_repaymentShare', repaymentShare)
