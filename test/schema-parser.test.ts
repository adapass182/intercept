// test/schema-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseEndpoints, resolveSchema } from '../src/lib/schema-parser'
import type { OpenAPISpec } from '../src/types'

const spec: OpenAPISpec = {
  paths: {
    '/api/users': {
      get: { tags: ['Users'], summary: 'List users', responses: {} },
      post: { tags: ['Users'], summary: 'Create user', responses: {} },
    },
    '/api/users/{id}': {
      get: { tags: ['Users'], summary: 'Get user', responses: {} },
    },
    '/api/reports': {
      get: { tags: ['Reports'], summary: 'List reports', responses: {} },
    },
  },
}

describe('parseEndpoints', () => {
  it('extracts all method+path combinations', () => {
    const endpoints = parseEndpoints(spec)
    expect(endpoints.map(e => e.key)).toEqual(
      expect.arrayContaining([
        'GET /api/users',
        'POST /api/users',
        'GET /api/users/{id}',
        'GET /api/reports',
      ])
    )
    expect(endpoints).toHaveLength(4)
  })

  it('includes tag, summary, method and path', () => {
    const endpoints = parseEndpoints(spec)
    const getUsersById = endpoints.find(e => e.key === 'GET /api/users/{id}')
    expect(getUsersById).toMatchObject({
      key: 'GET /api/users/{id}',
      method: 'GET',
      path: '/api/users/{id}',
      tag: 'Users',
      summary: 'Get user',
    })
  })

  it('uses "Other" tag when none provided', () => {
    const noTagSpec: OpenAPISpec = {
      paths: { '/api/foo': { get: { responses: {} } } },
    }
    const endpoints = parseEndpoints(noTagSpec)
    expect(endpoints[0].tag).toBe('Other')
  })
})

describe('resolveSchema', () => {
  it('returns schema as-is when no $ref', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } }
    expect(resolveSchema(schema, {})).toEqual(schema)
  })

  it('resolves a $ref to a component schema', () => {
    const schemas = { User: { type: 'object', properties: { id: { type: 'string' } } } }
    const schema = { $ref: '#/components/schemas/User' }
    expect(resolveSchema(schema, schemas)).toEqual(schemas.User)
  })

  it('returns undefined for an unknown $ref', () => {
    expect(resolveSchema({ $ref: '#/components/schemas/Missing' }, {})).toBeUndefined()
  })
})
