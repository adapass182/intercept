// src/lib/path-matcher.ts

export function extractPathFromUrl(urlOrPath: string): string {
  try {
    return new URL(urlOrPath).pathname
  } catch {
    return urlOrPath
  }
}

export function matchPath(template: string, concretePath: string): boolean {
  const templateParts = template.split('/').filter(Boolean)
  const concreteParts = concretePath.split('/').filter(Boolean)

  if (templateParts.length !== concreteParts.length) return false

  return templateParts.every((part, i) =>
    part.startsWith('{') && part.endsWith('}')
      ? true
      : part === concreteParts[i]
  )
}
