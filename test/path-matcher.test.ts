// test/path-matcher.test.ts
import { describe, it, expect } from 'vitest'
import { matchPath, extractPathFromUrl } from '../src/lib/path-matcher'

describe('extractPathFromUrl', () => {
  it('extracts pathname from a full URL', () => {
    expect(extractPathFromUrl('https://example.com/api/users/123?foo=bar'))
      .toBe('/api/users/123')
  })

  it('returns the input if it looks like a path already', () => {
    expect(extractPathFromUrl('/api/users/123')).toBe('/api/users/123')
  })
})

describe('matchPath', () => {
  it('matches an exact path', () => {
    expect(matchPath('/api/users', '/api/users')).toBe(true)
  })

  it('matches a path with a single template param', () => {
    expect(matchPath('/api/users/{id}', '/api/users/123')).toBe(true)
  })

  it('matches a path with multiple template params', () => {
    expect(matchPath('/api/orgs/{orgId}/users/{userId}', '/api/orgs/42/users/7')).toBe(true)
  })

  it('does not match different segment counts', () => {
    expect(matchPath('/api/users/{id}', '/api/users')).toBe(false)
  })

  it('does not match different static segments', () => {
    expect(matchPath('/api/users/{id}', '/api/posts/123')).toBe(false)
  })

  it('does not match a prefix', () => {
    expect(matchPath('/api/users', '/api/users/123')).toBe(false)
  })
})
