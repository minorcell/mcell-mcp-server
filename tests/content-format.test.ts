import { describe, expect, it } from 'vitest'
import { formatBlogDocumentText, formatBlogListText } from '../src/lib/content/format.js'

describe('content formatting', () => {
  it('formats blog list text with entries', () => {
    const text = formatBlogListText('Latest blogs', [
      {
        id: 'blog:2026/demo',
        slug: '2026/demo',
        title: 'Demo Post',
        date: '2026-01-01T00:00:00.000Z',
        url: '/blog/2026/demo',
        document: 'articles/blog_2026_demo.json'
      }
    ])

    expect(text).toContain('Latest blogs')
    expect(text).toContain('Demo Post')
    expect(text).toContain('blog:2026/demo')
  })

  it('formats no-result list', () => {
    const text = formatBlogListText('Search results', [])
    expect(text).toContain('No results.')
  })

  it('does not truncate when content is short', () => {
    const { article, text } = formatBlogDocumentText(
      {
        id: 'blog:2026/demo',
        slug: '2026/demo',
        title: 'Demo Post',
        url: '/blog/2026/demo',
        sourcePath: 'content/blog/2026/demo.md',
        metadata: {},
        content: 'short text'
      },
      100
    )

    expect(article.truncated).toBe(false)
    expect(article.content).toBe('short text')
    expect(text).toContain('short text')
  })

  it('truncates when content exceeds max chars', () => {
    const { article } = formatBlogDocumentText(
      {
        id: 'blog:2026/demo',
        slug: '2026/demo',
        title: 'Demo Post',
        url: '/blog/2026/demo',
        sourcePath: 'content/blog/2026/demo.md',
        metadata: {},
        content: 'x'.repeat(60)
      },
      20
    )

    expect(article.truncated).toBe(true)
    expect(article.content).toContain('[truncated]')
    expect(article.content.length).toBeGreaterThan(20)
  })
})
