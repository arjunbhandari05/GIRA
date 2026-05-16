"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts"

type Point = { day: number; value: number }

function PulsingEndDot({
  cx,
  cy,
  index,
  lastIndex,
  color,
}: {
  cx?: number
  cy?: number
  index?: number
  lastIndex: number
  color: string
}) {
  if (index !== lastIndex || cx == null || cy == null) return null
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={9}
        fill={color}
        className="live-chart-end-ring"
        opacity={0.28}
      />
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
    </g>
  )
}

export default function MetricAreaChart({
  data,
  stroke,
  fill,
  showLiveEnd = false,
}: {
  data: Point[]
  stroke: string
  fill: string
  /** Pulsing dot on the latest point (chart line stays static). */
  showLiveEnd?: boolean
}) {
  const lastIndex = data.length - 1

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F0" />
        <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#9895A8" />
        <YAxis tick={{ fontSize: 10 }} stroke="#9895A8" />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          fill={fill}
          isAnimationActive={false}
          dot={
            showLiveEnd
              ? (props) => {
                  const { key, cx, cy, index } = props
                  return (
                    <PulsingEndDot
                      key={key}
                      cx={cx}
                      cy={cy}
                      index={index}
                      lastIndex={lastIndex}
                      color={stroke}
                    />
                  )
                }
              : false
          }
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
