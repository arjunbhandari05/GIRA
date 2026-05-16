"use client"

import { useEffect, useRef, useState } from "react"

interface GiraLogoProps {
  size?: "sm" | "md" | "lg"
  showTagline?: boolean
}

export default function GiraLogo({ size = "lg", showTagline = true }: GiraLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(0)
  const [textStage, setTextStage] = useState(0)

  const scale = size === "lg" ? 1 : size === "md" ? 0.7 : 0.5
  const W = 80 * scale
  const H = 160 * scale

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
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    let animationId: number

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      const PAD = 4 * scale
      const R = W / 2

      // Draw pill outline with gradient
      const gradient = ctx.createLinearGradient(0, 0, W, H)
      gradient.addColorStop(0, "#5B3FD4")
      gradient.addColorStop(1, "#1A9E6E")

      // Pill shape path
      ctx.beginPath()
      ctx.moveTo(W - PAD, R)
      ctx.arcTo(W - PAD, PAD, W - R, PAD, R - PAD)
      ctx.lineTo(R, PAD)
      ctx.arcTo(PAD, PAD, PAD, R, R - PAD)
      ctx.lineTo(PAD, H - R)
      ctx.arcTo(PAD, H - PAD, R, H - PAD, R - PAD)
      ctx.lineTo(W - R, H - PAD)
      ctx.arcTo(W - PAD, H - PAD, W - PAD, H - R, R - PAD)
      ctx.closePath()
      ctx.strokeStyle = gradient
      ctx.lineWidth = 2 * scale
      ctx.stroke()

      // Fill entire pill with subtle purple tint
      ctx.beginPath()
      ctx.moveTo(W - PAD, R)
      ctx.arcTo(W - PAD, PAD, W - R, PAD, R - PAD)
      ctx.lineTo(R, PAD)
      ctx.arcTo(PAD, PAD, PAD, R, R - PAD)
      ctx.lineTo(PAD, H - R)
      ctx.arcTo(PAD, H - PAD, R, H - PAD, R - PAD)
      ctx.lineTo(W - R, H - PAD)
      ctx.arcTo(W - PAD, H - PAD, W - PAD, H - R, R - PAD)
      ctx.closePath()
      ctx.fillStyle = "rgba(91, 63, 212, 0.04)"
      ctx.fill()

      // DNA Helix - centered in full pill
      const amplitude = W / 2 - 12 * scale
      const cycles = 2.5
      const samples = 60
      const centerX = W / 2  // True center

      interface Point {
        x: number
        y: number
        z: number
        strand: number
      }

      const points: Point[] = []

      for (let i = 0; i < samples; i++) {
        const frac = i / (samples - 1)
        const y = H - 20 * scale - (H - 40 * scale) * frac
        const angle = frac * cycles * Math.PI * 2 + phaseRef.current

        const x1 = centerX + Math.sin(angle) * amplitude
        const z1 = Math.cos(angle)
        points.push({ x: x1, y, z: z1, strand: 1 })

        const x2 = centerX + Math.sin(angle + Math.PI) * amplitude
        const z2 = Math.cos(angle + Math.PI)
        points.push({ x: x2, y, z: z2, strand: 2 })
      }

      // Draw rungs
      for (let i = 0; i < samples; i += 5) {
        const p1 = points[i * 2]
        const p2 = points[i * 2 + 1]
        if (!p1 || !p2) continue
        const depth = (p1.z + 1) / 2

        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.strokeStyle = `rgba(91, 63, 212, ${0.1 + 0.25 * depth})`
        ctx.lineWidth = (1 + depth) * scale
        ctx.stroke()
      }

      // Draw strands
      ;[1, 2].forEach((strand) => {
        const color = strand === 1 ? "#5B3FD4" : "#1A9E6E"
        const strandPoints = points.filter((p) => p.strand === strand)

        // Back half
        ctx.beginPath()
        let started = false
        strandPoints.forEach((p) => {
          if (p.z < 0) {
            if (!started) {
              ctx.moveTo(p.x, p.y)
              started = true
            } else {
              ctx.lineTo(p.x, p.y)
            }
          }
        })
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5 * scale
        ctx.globalAlpha = 0.35
        ctx.stroke()

        // Front half
        ctx.beginPath()
        started = false
        strandPoints.forEach((p) => {
          if (p.z >= 0) {
            if (!started) {
              ctx.moveTo(p.x, p.y)
              started = true
            } else {
              ctx.lineTo(p.x, p.y)
            }
          }
        })
        ctx.strokeStyle = color
        ctx.lineWidth = 2 * scale
        ctx.globalAlpha = 1
        ctx.stroke()
      })

      // Draw nodes
      for (let i = 0; i < samples; i += 5) {
        ;[0, 1].forEach((offset) => {
          const p = points[i * 2 + offset]
          if (!p) return
          const depth = (p.z + 1) / 2
          const color = p.strand === 1 ? "#5B3FD4" : "#1A9E6E"
          const radius = (2 + 2 * depth) * scale

          ctx.beginPath()
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.globalAlpha = 0.4 + 0.6 * depth
          ctx.fill()
        })
      }

      ctx.globalAlpha = 1

      phaseRef.current += 0.03
      animationId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animationId)
  }, [W, H, scale])

  const fontSize = {
    gira: size === "lg" ? 48 : size === "md" ? 32 : 24,
    rx: size === "lg" ? 20 : size === "md" ? 14 : 10,
    tagline: size === "lg" ? 12 : size === "md" ? 10 : 8,
    subtitle: size === "lg" ? 15 : size === "md" ? 13 : 11,
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-6">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: W, height: H }}
          className="flex-shrink-0"
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
