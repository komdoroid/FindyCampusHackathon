import { SCORE_COLOR, SCORE_EMOJI } from '../shared/wards'
import { MoodFace, type MoodLevel } from './MoodFace'

// --- 気分の割合(横積み上げバー) ---
// SCORE_COLORは隣接色(黄とオレンジ)の弁別性が弱いため、色だけに頼らず
// 凡例に絵文字+件数+割合をテキストで併記する(secondary encoding)。
// 5段階は「悪い⇄良い」の順序尺度(Likertスケール)なので、円グラフより
// 積み上げバーの方が、割合の大小を横幅の直感的な比較として読み取りやすい。
export function MoodDistributionBar({ distribution }: { distribution: { score: number; count: number }[] }) {
  const countByScore = new Map(distribution.map((d) => [d.score, d.count]))
  const total = distribution.reduce((s, d) => s + d.count, 0)

  if (total === 0) {
    return <div className="chart-empty">データがありません</div>
  }

  const segments = [1, 2, 3, 4, 5]
    .map((score) => {
      const count = countByScore.get(score) ?? 0
      return { score, count, share: count / total }
    })
    .filter((s) => s.count > 0)

  return (
    <div className="dist-bar-wrap">
      <div className="dist-bar-track" role="img" aria-label="気分の割合">
        {segments.map((s) => (
          <div
            key={s.score}
            className="dist-bar-segment"
            style={{ flexGrow: s.share, flexBasis: 0, background: SCORE_COLOR[s.score] }}
            title={`${SCORE_EMOJI[s.score]} ${s.count}件(${Math.round(s.share * 100)}%)`}
          />
        ))}
      </div>
      <ul className="dist-bar-legend">
        {segments.map((s) => (
          <li key={s.score}>
            <MoodFace level={s.score as MoodLevel} size={22} />
            <span className="dist-bar-legend-count">{s.count}件</span>
            <span className="dist-bar-legend-pct">{Math.round(s.share * 100)}%</span>
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

  const width = 480
  const height = 180
  const padX = 26
  const padY = 22
  const stepX = (width - padX * 2) / (days.length - 1)
  // Y軸は気分1〜5の固定スケール
  const yFor = (value: number) => height - padY - ((value - 1) / 4) * (height - padY * 2)

  const points = days.map((date, i) => {
    const row = byDate.get(date)
    return { date, x: padX + i * stepX, y: row ? yFor(row.average) : null, average: row?.average ?? null }
  })
  const plotted = points.filter((p) => p.y !== null) as { date: string; x: number; y: number; average: number }[]

  const linePath = plotted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath =
    plotted.length > 0
      ? `${linePath} L ${plotted[plotted.length - 1].x} ${height - padY} L ${plotted[0].x} ${height - padY} Z`
      : ''
  const lastPoint = plotted[plotted.length - 1] ?? null

  const hasAnyData = plotted.length > 0

  return (
    <>
      {!hasAnyData ? (
        <div className="chart-empty">データがありません</div>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="line-svg"
          role="img"
          aria-label="直近7日の気分推移"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 気分1〜5の目盛り線(recessive、5=ふつうのラインだけ気持ち濃く) */}
          {[1, 2, 3, 4, 5].map((v) => (
            <line
              key={v}
              x1={padX}
              y1={yFor(v)}
              x2={width - padX}
              y2={yFor(v)}
              stroke={v === 3 ? '#e4e4e4' : '#f1f1f1'}
              strokeWidth={1}
            />
          ))}
          {[1, 3, 5].map((v) => (
            <text key={`y-${v}`} x={padX - 8} y={yFor(v) + 3} fontSize={10} fill="#aaa" textAnchor="end">
              {v}
            </text>
          ))}
          {areaPath && <path d={areaPath} fill="#f5a623" opacity={0.12} />}
          <path d={linePath} fill="none" stroke="#f5a623" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {plotted.map((p) => (
            <circle key={p.date} cx={p.x} cy={p.y} r={5} fill="#f5a623" stroke="#fff" strokeWidth={2}>
              <title>
                {p.date} 平均{p.average}/5
              </title>
            </circle>
          ))}
          {lastPoint && (
            <text
              x={lastPoint.x}
              y={lastPoint.y - 14}
              fontSize={13}
              fontWeight={700}
              fill="#555"
              textAnchor="middle"
            >
              {lastPoint.average}
            </text>
          )}
          {points.map((p, i) => (
            <text
              key={`x-${p.date}`}
              x={p.x}
              y={height - 2}
              fontSize={10}
              fill="#999"
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            >
              {p.date.slice(5).replace('-', '/')}
            </text>
          ))}
        </svg>
      )}
    </>
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

  const activeDays = cells.filter((c) => c.date <= todayIso && c.count > 0).length
  const totalPosts = cells.reduce((s, c) => s + c.count, 0)

  return (
    <div className="commit-calendar">
      <p className="commit-calendar-summary">
        直近13週で <strong>{activeDays}日</strong> 投稿 / 合計 <strong>{totalPosts}件</strong>
      </p>
      <div
        className="commit-calendar-grid"
        style={{ gridTemplateColumns: `28px repeat(${weeks.length}, 16px)` }}
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
