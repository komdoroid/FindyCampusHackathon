import { SCORE_COLOR, SCORE_EMOJI } from '../shared/wards'

// --- 円グラフ(気分の割合) ---
// SCORE_COLORは隣接色(黄とオレンジ)の弁別性が弱いため、色だけに頼らず
// 各スライスに直接ラベル(絵文字)を置き、凡例もテキストで併記する(secondary encoding)
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`
}

export function MoodPieChart({ distribution }: { distribution: { score: number; count: number }[] }) {
  const countByScore = new Map(distribution.map((d) => [d.score, d.count]))
  const total = distribution.reduce((s, d) => s + d.count, 0)

  if (total === 0) {
    return <div className="pie-empty">データがありません</div>
  }

  let angle = 0
  const cx = 60
  const cy = 60
  const r = 52
  const slices = [1, 2, 3, 4, 5].map((score) => {
    const count = countByScore.get(score) ?? 0
    const share = count / total
    const startAngle = angle
    const endAngle = angle + share * 360
    angle = endAngle
    const midAngle = (startAngle + endAngle) / 2
    const labelPos = polarToCartesian(cx, cy, r * 0.65, midAngle)
    return { score, count, share, startAngle, endAngle, labelPos }
  })

  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 120 120" className="pie-svg" role="img" aria-label="気分の割合">
        {slices
          .filter((s) => s.count > 0)
          .map((s) => (
            <path
              key={s.score}
              d={describeArc(cx, cy, r, s.startAngle, s.endAngle)}
              fill={SCORE_COLOR[s.score]}
              stroke="#fff"
              strokeWidth={2}
            >
              <title>
                {SCORE_EMOJI[s.score]} {s.count}件({Math.round(s.share * 100)}%)
              </title>
            </path>
          ))}
        {slices
          .filter((s) => s.share >= 0.08)
          .map((s) => (
            <text
              key={`label-${s.score}`}
              x={s.labelPos.x}
              y={s.labelPos.y}
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {SCORE_EMOJI[s.score]}
            </text>
          ))}
      </svg>
      <ul className="pie-legend">
        {slices
          .filter((s) => s.count > 0)
          .map((s) => (
            <li key={s.score}>
              <span className="pie-legend-swatch" style={{ background: SCORE_COLOR[s.score] }} />
              {SCORE_EMOJI[s.score]} {s.count}件
            </li>
          ))}
      </ul>
    </div>
  )
}

// --- 折れ線グラフ(直近7日の気分平均) ---
function last7Days(): string[] {
  const days: string[] = []
  const now = Date.now()
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10))
  }
  return days
}

export function MoodLineChart({
  dailyTrend,
}: {
  dailyTrend: { date: string; average: number; count: number }[]
}) {
  const days = last7Days()
  const byDate = new Map(dailyTrend.map((d) => [d.date, d]))

  const width = 220
  const height = 100
  const padX = 14
  const padY = 14
  const stepX = (width - padX * 2) / (days.length - 1)
  // Y軸は気分1〜5の固定スケール
  const yFor = (value: number) => height - padY - ((value - 1) / 4) * (height - padY * 2)

  const points = days.map((date, i) => {
    const row = byDate.get(date)
    return { date, x: padX + i * stepX, y: row ? yFor(row.average) : null, average: row?.average ?? null }
  })

  const linePath = points
    .filter((p) => p.y !== null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  const hasAnyData = points.some((p) => p.y !== null)

  return (
    <div className="line-wrap">
      {!hasAnyData ? (
        <div className="pie-empty">データがありません</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="line-svg" role="img" aria-label="直近7日の気分推移">
          {/* 目盛りの補助線(気分3=ふつうのライン) */}
          <line x1={padX} y1={yFor(3)} x2={width - padX} y2={yFor(3)} stroke="#eee" strokeWidth={1} />
          <path d={linePath} fill="none" stroke="#f5a623" strokeWidth={2} />
          {points.map(
            (p) =>
              p.y !== null && (
                <circle key={p.date} cx={p.x} cy={p.y} r={3.5} fill="#f5a623">
                  <title>
                    {p.date} 平均{p.average}/5
                  </title>
                </circle>
              )
          )}
          {points.map((p, i) => (
            <text
              key={`x-${p.date}`}
              x={p.x}
              y={height - 2}
              fontSize={7}
              fill="#999"
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            >
              {p.date.slice(5).replace('-', '/')}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}

// --- コミットカレンダー(直近13週) ---
const CALENDAR_LEVELS = [
  { max: 0, color: '#ebedf0' },
  { max: 1, color: '#ffe0b2' },
  { max: 3, color: '#ffb74d' },
  { max: 6, color: '#fb8c00' },
  { max: Infinity, color: '#e65100' },
]

function levelColor(count: number): string {
  return (CALENDAR_LEVELS.find((l) => count <= l.max) ?? CALENDAR_LEVELS[CALENDAR_LEVELS.length - 1]).color
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
// 詰まって見えないよう月/水/金だけ表示する(GitHubのコントリビューショングラフと同じ間引き方)
const WEEKDAY_LABEL_ROWS = new Set([1, 3, 5])

export function CommitCalendar({ calendar }: { calendar: { date: string; count: number }[] }) {
  const countByDate = new Map(calendar.map((c) => [c.date, c.count]))

  const days = 91
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayIso = today.toISOString().slice(0, 10)
  const start = new Date(today.getTime() - (days - 1) * 86_400_000)
  // グリッドの先頭を日曜始まりにそろえる
  const startDow = start.getUTCDay()
  const gridStart = new Date(start.getTime() - startDow * 86_400_000)

  const cells: { date: string; count: number }[] = []
  for (let d = new Date(gridStart); d <= today; d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10)
    cells.push({ date: iso, count: countByDate.get(iso) ?? 0 })
  }
  const weeks: { date: string; count: number }[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  // 月が変わった週の先頭にだけ「◯月」ラベルを出す
  const monthLabels = weeks.map((week, wi) => {
    const month = Number(week[0].date.slice(5, 7))
    if (wi === 0) return `${month}月`
    const prevMonth = Number(weeks[wi - 1][0].date.slice(5, 7))
    return month !== prevMonth ? `${month}月` : ''
  })

  return (
    <div className="commit-calendar">
      <div
        className="commit-calendar-grid"
        style={{ gridTemplateColumns: `24px repeat(${weeks.length}, 12px)` }}
      >
        <div className="commit-calendar-corner" style={{ gridColumn: 1, gridRow: 1 }} />
        {monthLabels.map(
          (label, wi) =>
            label && (
              <div
                key={`month-${wi}`}
                className="commit-calendar-month"
                style={{ gridColumn: wi + 2, gridRow: 1 }}
              >
                {label}
              </div>
            )
        )}
        {WEEKDAY_LABELS.map(
          (label, di) =>
            WEEKDAY_LABEL_ROWS.has(di) && (
              <div
                key={`weekday-${di}`}
                className="commit-calendar-weekday"
                style={{ gridColumn: 1, gridRow: di + 2 }}
              >
                {label}
              </div>
            )
        )}
        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            const isFuture = cell.date > todayIso
            return (
              <div
                key={cell.date}
                className="commit-calendar-cell"
                style={{
                  gridColumn: wi + 2,
                  gridRow: di + 2,
                  background: isFuture ? 'transparent' : levelColor(cell.count),
                }}
                title={isFuture ? undefined : `${cell.date}(${WEEKDAY_LABELS[di]}): ${cell.count}件`}
              />
            )
          })
        )}
      </div>
      <div className="commit-calendar-legend">
        <span>少</span>
        {CALENDAR_LEVELS.map((l) => (
          <span key={l.color} className="commit-calendar-swatch" style={{ background: l.color }} />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}
