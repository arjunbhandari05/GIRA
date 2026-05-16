import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const BULLET_RE = /^[\t ]*[-*•]\s+(.+)$/
const ORDERED_RE = /^[\t ]*\d+\.\s+(.+)$/

/** Parse **bold** and *italic* (never show raw asterisks). */
function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    if (match[1] != null) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold">
          {match[1]}
        </strong>
      )
    } else if (match[2] != null) {
      nodes.push(
        <em key={`${keyPrefix}-i-${i++}`} className="italic">
          {match[2]}
        </em>
      )
    }
    last = match.index + match[0].length
  }

  if (last < text.length) {
    nodes.push(text.slice(last))
  }

  return nodes.length ? nodes : [text]
}

type Block =
  | { type: "p"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++
    if (i >= lines.length) break

    if (BULLET_RE.test(lines[i])) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim() && BULLET_RE.test(lines[i])) {
        const m = lines[i].match(BULLET_RE)
        items.push(m?.[1] ?? lines[i])
        i++
      }
      blocks.push({ type: "ul", items })
      continue
    }

    if (ORDERED_RE.test(lines[i])) {
      const items: string[] = []
      while (i < lines.length && lines[i].trim() && ORDERED_RE.test(lines[i])) {
        const m = lines[i].match(ORDERED_RE)
        items.push(m?.[1] ?? lines[i])
        i++
      }
      blocks.push({ type: "ol", items })
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length) blocks.push({ type: "p", lines: paraLines })
  }

  return blocks
}

const defaultParagraphClass = "text-[15px] leading-[1.7] text-foreground my-3 first:mt-0 last:mb-0"
const defaultListClass = "text-[15px] leading-[1.7] text-foreground my-3 first:mt-0 last:mb-0"

/**
 * Shared markdown → React (bold, italic, bullets, numbered lists, paragraphs).
 * No raw markdown syntax is shown.
 */
export function renderMarkdown(
  text: string,
  options?: { paragraphClass?: string; listClass?: string }
): ReactNode {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) return null

  const paragraphClass = options?.paragraphClass ?? defaultParagraphClass
  const listClass = options?.listClass ?? defaultListClass
  const blocks = parseBlocks(normalized)
  const elements: ReactNode[] = []

  blocks.forEach((block, blockIdx) => {
    if (block.type === "ul") {
      elements.push(
        <ul key={`ul-${blockIdx}`} className={cn("list-disc space-y-2 pl-5", listClass)}>
          {block.items.map((item, i) => (
            <li key={`li-${blockIdx}-${i}`}>{parseInline(item, `ul-${blockIdx}-${i}`)}</li>
          ))}
        </ul>
      )
      return
    }

    if (block.type === "ol") {
      elements.push(
        <ol key={`ol-${blockIdx}`} className={cn("list-decimal space-y-2 pl-5", listClass)}>
          {block.items.map((item, i) => (
            <li key={`oli-${blockIdx}-${i}`}>{parseInline(item, `ol-${blockIdx}-${i}`)}</li>
          ))}
        </ol>
      )
      return
    }

    if (block.lines.length === 1) {
      elements.push(
        <p key={`p-${blockIdx}`} className={paragraphClass}>
          {parseInline(block.lines[0], `p-${blockIdx}`)}
        </p>
      )
    } else {
      elements.push(
        <p key={`p-${blockIdx}`} className={paragraphClass}>
          {block.lines.map((line, i) => (
            <span key={`pl-${blockIdx}-${i}`}>
              {i > 0 ? <br /> : null}
              {parseInline(line, `pl-${blockIdx}-${i}`)}
            </span>
          ))}
        </p>
      )
    }
  })

  return <div className="space-y-1">{elements}</div>
}

/** @deprecated Use renderMarkdown */
export const renderSimpleMarkdown = renderMarkdown

export function MarkdownContent({
  text,
  className,
  paragraphClass,
  listClass,
}: {
  text: string
  className?: string
  paragraphClass?: string
  listClass?: string
}) {
  const content = renderMarkdown(text, { paragraphClass, listClass })
  if (!content) return null
  return <div className={className}>{content}</div>
}
