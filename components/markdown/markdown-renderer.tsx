"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export type MarkdownRendererProps = {
  markdown: string
  className?: string
}

function isBlockCode(className?: string) {
  return (className ?? "").includes("language-")
}

export function MarkdownRenderer({ markdown, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        components={{
          p: ({ children, ...props }) => (
            <p
              className="whitespace-pre-wrap break-words text-foreground mb-2 last:mb-0"
              {...props}
            >
              {children}
            </p>
          ),
          a: ({ children, ...props }) => (
            <a
              className="break-words underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          ul: ({ children, ...props }) => (
            <ul className="ml-5 list-disc space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="ml-5 list-decimal space-y-1" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-snug" {...props}>
              {children}
            </li>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-2 border-muted pl-3 italic text-muted-foreground"
              {...props}
            >
              {children}
            </blockquote>
          ),
          hr: (props) => <hr className="my-3 border-muted" {...props} />,
          img: ({ alt, ...props }) => (
            // Intentionally using <img> for user-authored markdown.
            // Next/Image is not a good fit for untrusted dynamic src values.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="max-w-full h-auto rounded-md"
              loading="lazy"
              alt={alt ?? ""}
              {...props}
            />
          ),
          table: ({ children, ...props }) => (
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="border border-muted px-2 py-1 text-left font-semibold"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-muted px-2 py-1 align-top" {...props}>
              {children}
            </td>
          ),
          pre: ({ children, ...props }) => (
            <pre
              className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-sm"
              {...props}
            >
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            if (!isBlockCode(className)) {
              return (
                <code
                  className="rounded bg-muted px-[0.3rem] py-[0.15rem] font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            return (
              <code
                className={"block font-mono text-sm " + (className ?? "")}
                {...props}
              >
                {children}
              </code>
            )
          },
          input: ({ type, checked, ...props }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={!!checked}
                  readOnly
                  className="mr-2 align-middle"
                  {...props}
                />
              )
            }

            return <input type={type} {...props} />
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
