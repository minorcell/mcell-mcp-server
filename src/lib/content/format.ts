import type { BlogDocument, BlogDocumentWithTruncation, BlogEntry } from './types.js'

function truncateText(input: string, maxChars: number): { value: string; truncated: boolean } {
  if (input.length <= maxChars) {
    return { value: input, truncated: false }
  }
  return {
    value: `${input.slice(0, maxChars).trimEnd()}\n\n[truncated]`,
    truncated: true
  }
}

function formatEntryLine(entry: BlogEntry): string {
  const datePart = entry.date ? ` | ${entry.date}` : ''
  return [`- ${entry.title}${datePart}`, `  id: ${entry.id}`, `  slug: ${entry.slug}`, `  url: ${entry.url}`].join('\n')
}

export function formatBlogListText(title: string, entries: BlogEntry[]): string {
  if (!entries.length) {
    return `${title}\n\nNo results.`
  }
  return `${title}\n\n${entries.map((entry) => formatEntryLine(entry)).join('\n')}`
}

export function formatBlogDocumentText(
  document: BlogDocument,
  maxChars: number
): { text: string; article: BlogDocumentWithTruncation } {
  const body = truncateText(document.content, maxChars)
  const article: BlogDocumentWithTruncation = {
    ...document,
    content: body.value,
    truncated: body.truncated
  }
  const text = [
    `title: ${document.title}`,
    `id: ${document.id}`,
    `slug: ${document.slug}`,
    `date: ${document.date ?? 'unknown'}`,
    `url: ${document.url}`,
    '',
    body.value
  ].join('\n')

  return {
    text,
    article
  }
}
