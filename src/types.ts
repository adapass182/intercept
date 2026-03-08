// src/types.ts

export type Override = {
  enabled: boolean
  statusCode: number | null   // null = use real status code
  delayMs: number | null      // null = no delay
  bodyOverrides: Record<string, unknown>  // field-level patches
  rawBody: string | null      // if set, replaces body entirely
}

// key format: "GET /api/users/{id}"
export type OriginOverrides = Record<string, Override>

// chrome.storage.local shape: { [origin: string]: OriginOverrides }

export type MessageType =
  | { type: 'GET_OVERRIDES'; origin: string }
  | { type: 'SET_OVERRIDE'; origin: string; key: string; override: Override }
  | { type: 'DELETE_OVERRIDE'; origin: string; key: string }
  | { type: 'CHECK_INTERCEPT'; method: string; url: string }

export type CheckInterceptResponse =
  | { matched: false }
  | { matched: true; override: Override; templatePath: string }

export type OpenAPISpec = {
  paths: Record<string, OpenAPIPathItem>
  components?: {
    schemas?: Record<string, OpenAPISchema>
  }
}

export type OpenAPIPathItem = Partial<
  Record<'get' | 'post' | 'put' | 'patch' | 'delete', OpenAPIOperation>
>

export type OpenAPIOperation = {
  tags?: string[]
  summary?: string
  operationId?: string
  responses?: Record<string, OpenAPIResponse>
}

export type OpenAPIResponse = {
  content?: Record<string, { schema?: OpenAPISchema }>
}

export type OpenAPISchema = {
  type?: string
  properties?: Record<string, OpenAPISchema>
  items?: OpenAPISchema
  $ref?: string
  enum?: unknown[]
}
