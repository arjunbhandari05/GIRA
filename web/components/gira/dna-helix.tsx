"use client"

import { useEffect, useRef } from "react"

interface DNAHelixProps {
  className?: string
}

export default function DNAHelix({ className }: DNAHelixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const STRAND_COLOR_1 = "#5B3FD4"
    const STRAND_COLOR_2 = "#1A9E6E"
    const RUNG_COLOR = "rgba(91, 63, 212, 0.12)"
    const GLOW_1 = "rgba(91, 63, 212, 0.25)"
    const GLOW_2 = "rgba(26, 158, 110, 0.25)"
    const NODE_COLORS = ["#7C5CFC", "#22C98A", "#5B3FD4", "#1A9E6E"]

    let time = 0

    const draw = () => {
      const w = canvas.width / dpr
      const h = canvas.height / dpr

      ctx.clearRect(0, 0, w, h)

      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.45)
      grad.addColorStop(0, "rgba(91, 63, 212, 0.04)")
      grad.addColorStop(0.5, "rgba(26, 158, 110, 0.02)")
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const numPoints = 28
      const amplitude = Math.min(w * 0.28, 100)
      const verticalSpacing = h / (numPoints + 2)
      const twistSpeed = 0.025
      const phaseOffset = Math.PI

      for (let i = 0; i < numPoints; i++) {
        const y = verticalSpacing * (i + 1.5)
        const phase = (i / numPoints) * Math.PI * 4 + time
        const x1 = cx + Math.sin(phase) * amplitude
        const x2 = cx + Math.sin(phase + phaseOffset) * amplitude
        const depth1 = (Math.cos(phase) + 1) / 2
        const depth2 = (Math.cos(phase + phaseOffset) + 1) / 2

        ctx.beginPath()
        ctx.moveTo(x1, y)
        ctx.lineTo(x2, y)
        ctx.strokeStyle = RUNG_COLOR
        ctx.lineWidth = 1.5
        ctx.stroke()

        const nodeSize1 = 2 + depth1 * 2.5
        const nodeSize2 = 2 + depth2 * 2.5
        const midX = (x1 + x2) / 2

        ctx.beginPath()
        ctx.arc(midX, y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(91, 63, 212, ${0.1 + depth1 * 0.15})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(x1, y, nodeSize1, 0, Math.PI * 2)
        ctx.fillStyle = NODE_COLORS[i % 4]
        ctx.globalAlpha = 0.3 + depth1 * 0.7
        ctx.fill()
        ctx.globalAlpha = 1

        ctx.beginPath()
        ctx.arc(x2, y, nodeSize2, 0, Math.PI * 2)
        ctx.fillStyle = NODE_COLORS[(i + 2) % 4]
        ctx.globalAlpha = 0.3 + depth2 * 0.7
        ctx.fill()
        ctx.globalAlpha = 1
      }

      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath()
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const y = verticalSpacing * (i + 1)
          const phase = t * Math.PI * 4 + time + (pass === 1 ? phaseOffset : 0)
          const x = cx + Math.sin(phase) * amplitude
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        const strandColor = pass === 0 ? STRAND_COLOR_1 : STRAND_COLOR_2
        const glowColor = pass === 0 ? GLOW_1 : GLOW_2
        ctx.shadowColor = glowColor
        ctx.shadowBlur = 12
        ctx.strokeStyle = strandColor
        ctx.lineWidth = 2.5
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.stroke()
        ctx.shadowColor = "transparent"
        ctx.shadowBlur = 0
      }

      for (let i = 0; i < 12; i++) {
        const px = cx + Math.sin(time * 0.5 + i * 1.3) * (amplitude + 20 + i * 5)
        const py = h * ((time * 0.01 + i * 0.09) % 1)
        const size = 1 + Math.sin(time + i) * 0.8
        const alpha = 0.15 + Math.sin(time * 0.8 + i * 2) * 0.1
        ctx.beginPath()
        ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fillStyle =
          i % 2 === 0 ? `rgba(91, 63, 212, ${alpha})` : `rgba(26, 158, 110, ${alpha})`
        ctx.fill()
      }

      time += twistSpeed
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
      aria-hidden
    />
  )
}
