"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import type { LogLine } from "@/lib/types"

interface AgentConsoleProps {
  lines: LogLine[]
  running?: boolean
  loading?: boolean
  emptyHint?: string
  defaultOpen?: boolean
}

const typeColor: Record<LogLine["type"], string> = {
  info: "#1A9E6E",
  success: "#FFFFFF",
  warning: "#F59E0B",
  error: "#EF4444",
}

export default function AgentConsole({
  lines,
  running = false,
  loading = false,
  emptyHint = 'Click "Run GIRA Agent" to start the pipeline',
  defaultOpen = false,
}: AgentConsoleProps) {
  const [open, setOpen] = useState(defaultOpen)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines, running, open])

  return (
    <div className="border border-[#E8E6F0] rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#FAFAFC] transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-4 h-4 text-[#9895A8]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#9895A8]" />
          )}
          <span className="text-[13px] font-semibold text-[#0D0B14]">GIRA thinking</span>
          {running && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A9E6E]" />}
        </div>
        <span className="text-[11px] text-[#9895A8] font-mono">{lines.length} lines</span>
      </button>

      {open && (
        <div
          ref={logRef}
          className="agent-console-scanline relative font-mono text-[12px] leading-relaxed p-4 h-52 overflow-y-auto mx-4 mb-4 rounded-lg"
          style={{ backgroundColor: "#0D0B14" }}
        >
          {loading && lines.length === 0 ? (
            <p className="text-[#4A4757]">Checking cached brief…</p>
          ) : lines.length === 0 ? (
            <p className="text-[#4A4757]">{emptyHint}</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="mb-1.5">
                <span className="text-[#4A4757] mr-2">[{line.timestamp}]</span>
                {line.toolLabel && (
                  <span className="font-semibold mr-2" style={{ color: typeColor[line.type] }}>
                    {line.toolLabel}
                  </span>
                )}
                <span style={{ color: line.toolLabel ? "#E8E6F0" : typeColor[line.type] }}>{line.text}</span>
              </div>
            ))
          )}
          {running && (
            <p className="text-[#4A4757] mt-2 animate-pulse">
              <span className="mr-2">[···]</span>
              GIRA working…
            </p>
          )}
        </div>
      )}
    </div>
  )
}
