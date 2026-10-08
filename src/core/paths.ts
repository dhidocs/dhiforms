import { cloneDeep, get, has, isObjectLike, set, toPath } from 'lodash-es'
import type { Answers } from './types'

// Field paths address answers inside repeated rows: "coApplicants[0].nid".

export const fieldPath = (field: string, rowKey?: string, index?: number) => (rowKey == null ? field : `${rowKey}[${index}].${field}`)

const forbiddenSegments = new Set(['__proto__', 'prototype', 'constructor'])

const forbiddenSegment = (segments: string[]) => segments.find((segment) => forbiddenSegments.has(segment))

// Reads an own property only, so keys such as "toString" never resolve to inherited members.
export function ownValue(container: unknown, key: string | number): any {
  if (container == null || typeof container !== 'object') return undefined
  return Object.hasOwn(container, key) ? (container as any)[key] : undefined
}

// `has` checks that every segment is an own property; only objects and arrays count as containers, so "name.length" is undefined too.
export function getAnswer(answers: unknown, path: string | string[]): any {
  const segments = toPath(path)
  if (segments.length === 0 || forbiddenSegment(segments) !== undefined || !has(answers, segments)) return undefined
  const insideContainers = segments.every((_, depth) => isObjectLike(depth === 0 ? answers : get(answers, segments.slice(0, depth))))
  return insideContainers ? get(answers, segments) : undefined
}

// Returns a copy with the value written at the path; arrays and objects along the way are created when missing.
export function setAnswer(answers: Answers, path: string, value: unknown): Answers {
  const segments = toPath(path)
  const forbidden = forbiddenSegment(segments)
  if (forbidden !== undefined) throw new Error(`Answer path '${path}' contains '${forbidden}', which is not allowed in a field key`)
  return set(cloneDeep(answers ?? {}), segments, value)
}

export const isEmptyAnswer = (value: unknown) => value == null || value === '' || (Array.isArray(value) && value.length === 0)
