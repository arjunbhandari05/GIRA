"use client"

import { useEffect, useRef, useState } from "react"

interface GiraLogoProps {
  size?: "sm" | "md" | "lg"
  showTagline?: boolean
}

function traceCapsule(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  length: number,
  diameter: number
) {
  const r = diameter / 2
  const x0 = cx - length / 2 + r
  const x1 = cx + length / 2 - r
  ctx.beginPath()
  ctx.moveTo(x0, cy - r)
  ctx.lineTo(x1, cy - r)
  ctx.arc(x1, cy, r, -Math.PI / 2, Math.PI / 2, false)
  ctx.lineTo(x0, cy + r)
  ctx.arc(x0, cy, r, Math.PI / 2, -Math.PI / 2, false)
  ctx.closePath()
}

type HelixPoint = {
  sx: number
  sy: number
  depth: number
  strand: 1 | 2
  t: number
}

/** Build 3D double-helix points, rotated around the pill's long axis. */
function buildHelixPoints(
  cx: number,
  cy: number,
  helixLength: number,
  radius: number,
  turns: number,
  steps: number,
  spin: number
): HelixPoint[] {
  const points: HelixPoint[] = []
  const x0 = cx - helixLength / 2

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const ax = x0 + t * helixLength
    const theta = t * turns * Math.PI * 2 + spin

    for (const strand of [1, 2] as const) {
      const phase = strand === 1 ? 0 : Math.PI
      const y = radius * Math.cos(theta + phase)
      const z = radius * Math.sin(theta + phase)

      // Rotate around long axis (X) so helix spins in view
      const ry = y
      const rz = z

      points.push({
        sx: ax,
        sy: cy + ry,
        depth: rz,
        strand,
        t,
      })
    }
  }
  return points
}

export default function GiraLogo({ size = "lg", showTagline = true }: GiraLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spinRef = useRef(0)
  const [textStage, setTextStage] = useState(0)

  const scale = size === "lg" ? 1 : size === "md" ? 0.7 : 0.5
  const canvasSize = 132 * scale
  const pillLength = 112 * scale
  const pillDiameter = 42 * scale
  const pillAngle = -1.05

  useEffect(() => {
    const t1 = setTimeout(() => setTextStage(1), 400)
    const t2 = setTimeout(() => setTextStage(2), 700)
    const t3 = setTimeout(() => setTextStage(3), 1000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize * dpr
    canvas.height = canvasSize * dpr
    ctx.scale(dpr, dpr)

    const cx = canvasSize / 2
    const cy = canvasSize / 2

    const PILL = {
      left: "#F2F1F5",
      leftEdge: "#E4E2EA",
      right: "#E8E6F0",
      rightEdge: "#D8D5E0",
      seam: "rgba(152, 149, 168, 0.55)",
      shadow: "rgba(13, 11, 20, 0.06)",
    }

    const DNA = {
      purple: "#5B3FD4",
      purpleLight: "#8B74E8",
      green: "#1A9E6E",
      greenLight: "#34C48E",
      rung: "rgba(91, 63, 212, 0.35)",
    }

    let animationId: number

    const drawPill = () => {
      // Right half
      ctx.save()
      traceCapsule(ctx, cx, cy, pillLength, pillDiameter)
      ctx.clip()
      ctx.fillStyle = PILL.right
      ctx.fillRect(cx, cy - pillDiameter, canvasSize, pillDiameter * 2)
      const rightShade = ctx.createLinearGradient(cx, cy, cx + pillLength / 2, cy)
      rightShade.addColorStop(0, "rgba(255,255,255,0)")
      rightShade.addColorStop(1, PILL.shadow)
      ctx.fillStyle = rightShade
      ctx.fillRect(cx, cy - pillDiameter / 2, pillLength / 2, pillDiameter)
      ctx.restore()

      // Left half
      ctx.save()
      traceCapsule(ctx, cx, cy, pillLength, pillDiameter)
      ctx.clip()
      ctx.fillStyle = PILL.left
      ctx.fillRect(0, cy - pillDiameter, cx, pillDiameter * 2)
      const leftShade = ctx.createLinearGradient(cx - pillLength / 2, cy, cx, cy)
      leftShade.addColorStop(0, PILL.shadow)
      leftShade.addColorStop(1, "rgba(255,255,255,0.35)")
      ctx.fillStyle = leftShade
      ctx.fillRect(cx - pillLength / 2, cy - pillDiameter / 2, pillLength / 2, pillDiameter)
      ctx.restore()

      // Gloss
      ctx.save()
      traceCapsule(ctx, cx, cy, pillLength, pillDiameter)
      ctx.clip()
      const gloss = ctx.createRadialGradient(
        cx - pillLength * 0.2,
        cy - pillDiameter * 0.3,
        0,
        cx - pillLength * 0.2,
        cy - pillDiameter * 0.3,
        pillDiameter * 0.85
      )
      gloss.addColorStop(0, "rgba(255,255,255,0.55)")
      gloss.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = gloss
      ctx.fillRect(cx - pillLength / 2, cy - pillDiameter / 2, pillLength, pillDiameter)
      ctx.restore()

      // Seam
      ctx.save()
      traceCapsule(ctx, cx, cy, pillLength, pillDiameter)
      ctx.clip()
      ctx.fillStyle = PILL.seam
      ctx.fillRect(cx - 0.8 * scale, cy - pillDiameter / 2, 1.6 * scale, pillDiameter)
      ctx.restore()

      // Brand border: purple → green along capsule length
      traceCapsule(ctx, cx, cy, pillLength, pillDiameter)
      const borderGrad = ctx.createLinearGradient(
        cx - pillLength / 2,
        cy - pillDiameter / 2,
        cx + pillLength / 2,
        cy + pillDiameter / 2
      )
      borderGrad.addColorStop(0, DNA.purple)
      borderGrad.addColorStop(0.48, DNA.purpleLight)
      borderGrad.addColorStop(0.52, DNA.greenLight)
      borderGrad.addColorStop(1, DNA.green)
      ctx.strokeStyle = borderGrad
      ctx.lineWidth = 2.2 * scale
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.stroke()

      // Inner highlight edge for depth
      traceCapsule(ctx, cx, cy, pillLength - 1.2 * scale, pillDiameter - 1.2 * scale)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)"
      ctx.lineWidth = 0.8 * scale
      ctx.stroke()
    }

    const drawHelix = () => {
      const helixLength = pillLength - pillDiameter - 8 * scale
      const radius = pillDiameter * 0.3
      const steps = 72
      const turns = 2.4
      const spin = spinRef.current

      const pts = buildHelixPoints(cx, cy, helixLength, radius, turns, steps, spin)

      // Base-pair rungs (depth-sorted)
      const rungs: { a: HelixPoint; b: HelixPoint; depth: number }[] = []
      for (let i = 0; i < steps; i += 2) {
        const a = pts[i * 2]
        const b = pts[i * 2 + 1]
        if (!a || !b) continue
        rungs.push({ a, b, depth: (a.depth + b.depth) / 2 })
      }
      rungs.sort((x, y) => x.depth - y.depth)

      for (const { a, b, depth } of rungs) {
        const alpha = 0.25 + 0.45 * ((depth / radius + 1) / 2)
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        const rungGrad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy)
        rungGrad.addColorStop(0, DNA.purple)
        rungGrad.addColorStop(1, DNA.green)
        ctx.strokeStyle = rungGrad
        ctx.globalAlpha = alpha
        ctx.lineWidth = 1.4 * scale
        ctx.lineCap = "round"
        ctx.stroke()
      }

      // Strands — back then front
      const drawStrand = (strand: 1 | 2, front: boolean) => {
        const color = strand === 1 ? DNA.purple : DNA.green
        const light = strand === 1 ? DNA.purpleLight : DNA.greenLight
        const strandPts = pts.filter((p) => p.strand === strand && (front ? p.depth >= 0 : p.depth < 0))
        if (strandPts.length < 2) return

        ctx.beginPath()
        ctx.moveTo(strandPts[0].sx, strandPts[0].sy)
        for (let i = 1; i < strandPts.length; i++) {
          ctx.lineTo(strandPts[i].sx, strandPts[i].sy)
        }

        ctx.strokeStyle = color
        ctx.lineWidth = (front ? 2.6 : 1.6) * scale
        ctx.globalAlpha = front ? 1 : 0.35
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.stroke()

        if (front) {
          ctx.strokeStyle = light
          ctx.lineWidth = 1 * scale
          ctx.globalAlpha = 0.45
          ctx.stroke()
        }
      }

      drawStrand(1, false)
      drawStrand(2, false)
      drawStrand(1, true)
      drawStrand(2, true)

      // Backbone nodes on front strand
      for (let i = 0; i < steps; i += 3) {
        for (const strand of [1, 2] as const) {
          const p = pts[i * 2 + (strand === 1 ? 0 : 1)]
          if (!p || p.depth < 0) continue
          const color = strand === 1 ? DNA.purpleLight : DNA.greenLight
          const r = 2.2 * scale
          ctx.beginPath()
          ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.globalAlpha = 0.85
          ctx.fill()
        }
      }

      ctx.globalAlpha = 1
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvasSize, canvasSize)

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(pillAngle)
      ctx.translate(-cx, -cy)

      drawPill()

      ctx.save()
      traceCapsule(ctx, cx, cy, pillLength, pillDiameter)
      ctx.clip()
      drawHelix()
      ctx.restore()

      ctx.restore()

      spinRef.current += 0.045
      animationId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animationId)
  }, [canvasSize, pillLength, pillDiameter, pillAngle, scale])

  const fontSize = {
    gira: size === "lg" ? 48 : size === "md" ? 32 : 24,
    rx: size === "lg" ? 20 : size === "md" ? 14 : 10,
    tagline: size === "lg" ? 12 : size === "md" ? 10 : 8,
    subtitle: size === "lg" ? 15 : size === "md" ? 13 : 11,
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2.5">
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          style={{ width: canvasSize, height: canvasSize }}
          className="flex-shrink-0"
          aria-hidden
        />
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span
              className="transition-all duration-500"
              style={{
                fontSize: fontSize.gira,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "#0D0B14",
                opacity: textStage >= 1 ? 1 : 0,
                transform: textStage >= 1 ? "translateY(0)" : "translateY(10px)",
              }}
            >
              GIRA
            </span>
            <span
              className="transition-all duration-500"
              style={{
                fontSize: fontSize.rx,
                fontWeight: 500,
                color: "#5B3FD4",
                opacity: textStage >= 1 ? 1 : 0,
                transform: textStage >= 1 ? "translateY(0)" : "translateY(10px)",
              }}
            >
              Rx
            </span>
          </div>
          <span
            className="uppercase transition-all duration-500"
            style={{
              fontSize: fontSize.tagline,
              letterSpacing: "0.1em",
              color: "#9895A8",
              opacity: textStage >= 2 ? 1 : 0,
              transform: textStage >= 2 ? "translateY(0)" : "translateY(8px)",
            }}
          >
            Genomic Inference Rx Agent
          </span>
        </div>
      </div>
      {showTagline && (
        <p
          className="italic transition-all duration-500"
          style={{
            fontSize: fontSize.subtitle,
            color: "#5B3FD4",
            opacity: textStage >= 3 ? 1 : 0,
            transform: textStage >= 3 ? "translateY(0)" : "translateY(8px)",
          }}
        >
          Your genes are just the beginning.
        </p>
      )}
    </div>
  )
}
