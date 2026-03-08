// src/lib/body-merger.ts
import type { Override } from '../types'

export function mergeBody(
  realBody: unknown,
  override: Override
): unknown {
  if (override.rawBody !== null) {
    return JSON.parse(override.rawBody)
  }

  const base = typeof realBody === 'object' && realBody !== null ? realBody : {}
  return { ...base as object, ...override.bodyOverrides }
}
