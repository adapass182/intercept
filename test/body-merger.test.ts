// test/body-merger.test.ts
import { describe, it, expect } from 'vitest'
import { mergeBody } from '../src/lib/body-merger'
import type { Override } from '../src/types'

const baseOverride: Override = {
  enabled: true,
  statusCode: null,
  delayMs: null,
  bodyOverrides: {},
  rawBody: null,
}

describe('mergeBody', () => {
  it('returns the real body unchanged when no overrides', () => {
    const real = { id: '1', role: 'user' }
    expect(mergeBody(real, baseOverride)).toEqual({ id: '1', role: 'user' })
  })

  it('applies field-level overrides on top of real body', () => {
    const real = { id: '1', role: 'user', name: 'Alice' }
    const override = { ...baseOverride, bodyOverrides: { role: 'admin' } }
    expect(mergeBody(real, override)).toEqual({ id: '1', role: 'admin', name: 'Alice' })
  })

  it('rawBody takes precedence over everything when set', () => {
    const real = { id: '1', role: 'user' }
    const override = {
      ...baseOverride,
      bodyOverrides: { role: 'admin' },
      rawBody: '{"custom": true}',
    }
    expect(mergeBody(real, override)).toEqual({ custom: true })
  })

  it('handles a null real body gracefully', () => {
    const override = { ...baseOverride, bodyOverrides: { foo: 'bar' } }
    expect(mergeBody(null, override)).toEqual({ foo: 'bar' })
  })
})
