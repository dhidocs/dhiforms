import { describe, expect, it } from 'vitest'
import { localize } from '../src/core/text'
import { validateField } from '../src/core/validate'

describe('localize', () => {
  it('returns plain text as it is in either language', () => {
    expect(localize('Island', 'en')).toBe('Island')
    expect(localize('Island', 'dv')).toBe('Island')
  })

  it('picks the Dhivehi text and falls back to English when there is none', () => {
    expect(localize({ en: 'Island', dv: 'ރަށް' }, 'dv')).toBe('ރަށް')
    expect(localize({ en: 'Island', dv: 'ރަށް' }, 'en')).toBe('Island')
    expect(localize({ en: 'Island' }, 'dv')).toBe('Island')
    expect(localize({ en: 'Island', dv: '' }, 'dv')).toBe('Island')
  })

  it('defaults to English and treats missing text as empty', () => {
    expect(localize({ en: 'Island', dv: 'ރަށް' })).toBe('Island')
    expect(localize(undefined, 'dv')).toBe('')
  })
})

describe('validation messages', () => {
  it('quotes the label in the language of each message', () => {
    const field = { key: 'cost', type: 'amount' as const, label: { en: 'Total cost (USD)', dv: 'ޖުމްލަ ހަރަދު (USD)' }, required: true, min: 1 }
    expect(validateField(field, undefined, {})).toEqual({ en: 'Enter total cost', dv: 'ޖުމްލަ ހަރަދު ލިޔުއްވާ' })
    expect(localize(validateField(field, 0, {})!, 'en')).toBe('Total cost must be at least 1')
    expect(localize(validateField(field, 0, {})!, 'dv')).toBe('ޖުމްލަ ހަރަދު ވާންޖެހޭނީ މަދުވެގެން 1')
  })

  it('uses the English label in a Dhivehi message when the field has no translation', () => {
    const field = { key: 'accountNo', type: 'text' as const, label: 'Account number', required: true }
    expect(validateField(field, '', {})).toEqual({ en: 'Enter account number', dv: 'Account number ލިޔުއްވާ' })
  })
})
