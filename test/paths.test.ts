import { describe, expect, it } from 'vitest'
import { fieldPath, getAnswer, isEmptyAnswer, setAnswer } from '../src/core/paths'

describe('getAnswer', () => {
  const answers = { cost: 100, coApplicants: [{ nid: 'A123456' }, { nid: 'A234567' }] }

  it('reads top-level and repeated paths', () => {
    expect(getAnswer(answers, 'cost')).toBe(100)
    expect(getAnswer(answers, 'coApplicants[1].nid')).toBe('A234567')
    expect(getAnswer(answers, 'coApplicants.0.nid')).toBe('A123456')
  })

  it('returns undefined for missing paths', () => {
    expect(getAnswer(answers, 'coApplicants[5].nid')).toBeUndefined()
    expect(getAnswer(answers, 'nothing.here')).toBeUndefined()
    expect(getAnswer(undefined, 'cost')).toBeUndefined()
    expect(getAnswer(answers, '')).toBeUndefined()
  })

  it('reads own properties only', () => {
    expect(getAnswer(answers, 'toString')).toBeUndefined()
    expect(getAnswer(answers, 'constructor')).toBeUndefined()
    expect(getAnswer(answers, '__proto__')).toBeUndefined()
    expect(getAnswer(answers, 'cost.constructor.name')).toBeUndefined()
    expect(getAnswer({ toString: 'mine' }, 'toString')).toBe('mine')
  })
})

describe('setAnswer', () => {
  it('returns a copy and leaves the original untouched', () => {
    const answers = { coApplicants: [{ nid: 'A123456' }] }
    const next = setAnswer(answers, 'coApplicants[0].nid', 'A999999')
    expect(next.coApplicants[0].nid).toBe('A999999')
    expect(answers.coApplicants[0].nid).toBe('A123456')
  })

  it('creates arrays and objects along the way', () => {
    expect(setAnswer({}, 'coApplicants[1].nid', 'A1')).toEqual({ coApplicants: [undefined, { nid: 'A1' }] })
    expect(setAnswer({}, 'cost', 5)).toEqual({ cost: 5 })
  })

  it('rejects prototype segments', () => {
    expect(() => setAnswer({}, '__proto__.polluted', true)).toThrow("contains '__proto__'")
    expect(() => setAnswer({}, 'a.constructor.prototype', true)).toThrow("contains 'constructor'")
    expect(({} as any).polluted).toBeUndefined()
  })
})

describe('helpers', () => {
  it('builds repeated paths', () => {
    expect(fieldPath('nid')).toBe('nid')
    expect(fieldPath('nid', 'coApplicants', 2)).toBe('coApplicants[2].nid')
  })

  it('treats null, empty text and empty lists as empty', () => {
    expect([null, undefined, '', []].every(isEmptyAnswer)).toBe(true)
    expect([0, false, 'x', [1]].some(isEmptyAnswer)).toBe(false)
  })
})
