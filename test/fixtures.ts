import type { FormDefinition } from '../src/core/types'

// A small financing application used across the tests.
export const sampleForm = (): FormDefinition => ({
  key: 'test-financing',
  version: 1,
  title: 'Test application',
  pages: [
    {
      key: 'financing',
      title: 'Financing',
      rows: [
        { type: 'heading', text: 'Your request' },
        {
          type: 'fields',
          fields: [
            { key: 'financingType', type: 'radio', label: 'Type of financing', required: true, options: [{ value: 'personal', label: 'Personal' }, { value: 'business', label: 'Business' }] },
            { key: 'cost', type: 'amount', label: 'Cost', required: true, businessRules: [{ id: 'br_cap', description: 'Cost at most 2,000,000' }] },
            { key: 'ownFunds', type: 'amount', label: 'Own funds' },
            { key: 'loan', type: 'computed', label: 'Loan', format: 'amount', formula: { fn: 'DIFFERENCE', args: ['cost', 'ownFunds'] } },
          ],
        },
      ],
    },
    {
      key: 'household',
      title: 'Household',
      rows: [
        {
          type: 'repeated',
          key: 'coApplicants',
          itemLabel: 'Co-applicant',
          repeatType: 'add',
          fields: [
            { key: 'nid', type: 'nid', label: 'National ID', required: true },
            { key: 'income', type: 'amount', label: 'Income' },
            { key: 'disability', type: 'lookup', label: 'Disability registration', connector: 'disability-registry', inputs: { nid: 'nid' } },
          ],
        },
        {
          type: 'fields',
          fields: [
            { key: 'monthlyIncome', type: 'amount', label: 'Your income' },
            { key: 'householdIncome', type: 'computed', label: 'Household income', format: 'amount', formula: { fn: 'SUM', args: ['monthlyIncome', 'coApplicants.income'] } },
            { key: 'members', type: 'computed', label: 'Co-applicants', formula: { fn: 'COUNT', args: ['coApplicants'] } },
          ],
        },
      ],
    },
  ],
})
