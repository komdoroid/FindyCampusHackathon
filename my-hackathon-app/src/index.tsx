import { Hono } from 'hono'
import { agentsMiddleware } from 'hono-agents'
import { renderToReadableStream } from 'react-dom/server'
import { Script, Link, ViteClient, ReactRefresh } from 'vite-ssr-components/react'
import {
  WARDS,
  isValidWardId,
  scoreToWeather,
  ALERT_LOW,
  ALERT_HIGH,
  MIN_COUNT,
  WINDOW_HOURS,
} from './shared/wards'
export { CounterAgent } from './agents/counter'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('*', agentsMiddleware())

app.post('/api/moods', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return c.json({ ok: false, error: 'invalid body' }, 400)
  }

  const { ward, score, comment, gender, ageGroup, userId } = body as Record<string, unknown>

  if (typeof ward !== 'string' || !isValidWardId(ward)) {
    return c.json({ ok: false, error: 'invalid ward' }, 400)
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
    return c.json({ ok: false, error: 'invalid score' }, 400)
  }
  const trimmedComment = typeof comment === 'string' ? comment.slice(0, 100) : null
  const genderValue = typeof gender === 'string' ? gender : null
  const ageGroupValue = typeof ageGroup === 'string' ? ageGroup : null
  const userIdValue = typeof userId === 'string' ? userId : null

  await c.env.DB.prepare(
    'INSERT INTO moods (ward, score, comment, gender, age_group, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(ward, score, trimmedComment, genderValue, ageGroupValue, userIdValue)
    .run()

  return c.json({ ok: true })
})

app.get('/api/summary', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ward, COUNT(*) as count, AVG(score) as average
     FROM moods
     WHERE created_at >= datetime('now', ?)
     GROUP BY ward`
  )
    .bind(`-${WINDOW_HOURS} hours`)
    .all<{ ward: string; count: number; average: number }>()

  const statsByWard = new Map(results.map((r) => [r.ward, r]))

  const wards = WARDS.map((w) => {
    const stat = statsByWard.get(w.id)
    const count = stat?.count ?? 0
    const enough = count >= MIN_COUNT
    const average = enough ? Number(stat!.average.toFixed(1)) : null
    return {
      ward: w.id,
      name: w.name,
      count,
      average,
      enough,
      weather: enough ? scoreToWeather(average!) : null,
    }
  })

  const total = wards.reduce((sum, w) => sum + w.count, 0)
  const overallSum = results.reduce((sum, r) => sum + r.average * r.count, 0)
  const overall = total > 0 ? Number((overallSum / total).toFixed(1)) : null

  const alerts = wards
    .filter((w) => w.enough && w.average !== null)
    .flatMap((w) => {
      if (w.average! < ALERT_LOW) {
        return [{ ward: w.ward, type: 'low' as const, message: `${w.name}、雨模様です。何かありましたか？` }]
      }
      if (w.average! > ALERT_HIGH) {
        return [{ ward: w.ward, type: 'high' as const, message: `${w.name}、よく晴れています。何かいいことが？` }]
      }
      return []
    })

  return c.json({ wards, total, overall, alerts })
})

app.get('/api/moods/recent', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, ward, score, comment, user_id as userId, created_at as createdAt
     FROM moods
     WHERE created_at >= datetime('now', ?)
     ORDER BY created_at DESC
     LIMIT 2000`
  )
    .bind(`-${WINDOW_HOURS} hours`)
    .all<{
      id: number
      ward: string
      score: number
      comment: string | null
      userId: string | null
      createdAt: string
    }>()

  return c.json({ posts: results })
})

app.get('/api/moods/mine', async (c) => {
  const userId = c.req.query('userId')
  if (!userId) {
    return c.json({ ok: false, error: 'userId required' }, 400)
  }
  const pageSize = 50
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)
  const offset = (page - 1) * pageSize

  const [{ results }, countRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, ward, score, comment, created_at as createdAt
       FROM moods
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(userId, pageSize, offset)
      .all<{ id: number; ward: string; score: number; comment: string | null; createdAt: string }>(),
    c.env.DB.prepare('SELECT COUNT(*) as c FROM moods WHERE user_id = ?')
      .bind(userId)
      .first<{ c: number }>(),
  ])

  const total = countRow?.c ?? 0
  return c.json({
    posts: results,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
})

const CALENDAR_DAYS = 91 // 直近13週分(GitHub風コミットカレンダー用)

app.get('/api/moods/mine/summary', async (c) => {
  const userId = c.req.query('userId')
  if (!userId) {
    return c.json({ ok: false, error: 'userId required' }, 400)
  }

  const [latest, totals, distribution, dailyTrend, calendar] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ward, score, comment, created_at as createdAt
       FROM moods WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    )
      .bind(userId)
      .first<{ ward: string; score: number; comment: string | null; createdAt: string }>(),
    c.env.DB.prepare('SELECT COUNT(*) as total, MIN(created_at) as firstPostDate FROM moods WHERE user_id = ?')
      .bind(userId)
      .first<{ total: number; firstPostDate: string | null }>(),
    c.env.DB.prepare('SELECT score, COUNT(*) as count FROM moods WHERE user_id = ? GROUP BY score')
      .bind(userId)
      .all<{ score: number; count: number }>(),
    c.env.DB.prepare(
      `SELECT date(created_at) as date, AVG(score) as average, COUNT(*) as count
       FROM moods
       WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
       GROUP BY date ORDER BY date`
    )
      .bind(userId)
      .all<{ date: string; average: number; count: number }>(),
    c.env.DB.prepare(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM moods
       WHERE user_id = ? AND created_at >= datetime('now', ?)
       GROUP BY date ORDER BY date`
    )
      .bind(userId, `-${CALENDAR_DAYS} days`)
      .all<{ date: string; count: number }>(),
  ])

  return c.json({
    latest: latest ?? null,
    totalPosts: totals?.total ?? 0,
    firstPostDate: totals?.firstPostDate ?? null,
    distribution: distribution.results,
    dailyTrend: dailyTrend.results.map((r) => ({ ...r, average: Number(r.average.toFixed(1)) })),
    calendar: calendar.results,
  })
})

const INSIGHT_TTL_MS = 10 * 60 * 1000 // 10分キャッシュ(ユーザーごとに定期的に再生成)
const MIN_POSTS_FOR_INSIGHT = 1
const FALLBACK_INSIGHT_COMMENT =
  '分析コメントは現在準備中です。しばらくしてからもう一度ご確認ください。'
const NOT_ENOUGH_DATA_COMMENT =
  'まだ投稿がありません。気分を投稿すると、天気との関連を分析します。'
const TOKYO_LAT = 35.6895
const TOKYO_LNG = 139.7

// WMO Weather interpretation codes (Open-Meteo)
function weatherCodeToLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: '晴れ', emoji: '☀️' }
  if (code <= 2) return { label: '晴れ時々くもり', emoji: '🌤️' }
  if (code === 3) return { label: 'くもり', emoji: '☁️' }
  if (code === 45 || code === 48) return { label: '霧', emoji: '🌫️' }
  if (code >= 51 && code <= 57) return { label: '小雨', emoji: '🌦️' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: '雨', emoji: '🌧️' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: '雪', emoji: '❄️' }
  if (code >= 95) return { label: '雷雨', emoji: '⛈️' }
  return { label: 'くもり', emoji: '☁️' }
}

const SCORE_MEANING: Record<number, string> = {
  1: 'とても悪い',
  2: 'やや悪い',
  3: 'ふつう',
  4: 'やや良い',
  5: 'とても良い',
}

interface UserInsightRow {
  weather_temp: number | null
  weather_code: number | null
  weather_label: string | null
  post_count: number
  comment: string
  generated_at: string
}

async function fetchTokyoWeather(): Promise<{
  temp: number | null
  code: number | null
  label: string | null
}> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${TOKYO_LAT}&longitude=${TOKYO_LNG}&current_weather=true`
    )
    if (res.ok) {
      const data = (await res.json()) as {
        current_weather?: { temperature: number; weathercode: number }
      }
      if (data.current_weather) {
        return {
          temp: data.current_weather.temperature,
          code: data.current_weather.weathercode,
          label: weatherCodeToLabel(data.current_weather.weathercode).label,
        }
      }
    }
  } catch {
    // 天気取得失敗時はnullのまま進める
  }
  return { temp: null, code: null, label: null }
}

async function generateUserInsight(env: CloudflareBindings, userId: string): Promise<UserInsightRow> {
  const { temp: weatherTemp, code: weatherCode, label: weatherLabel } = await fetchTokyoWeather()

  const { results: recentPosts } = await env.DB.prepare(
    `SELECT ward, score, comment, created_at as createdAt
     FROM moods
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 10`
  )
    .bind(userId)
    .all<{ ward: string; score: number; comment: string | null; createdAt: string }>()

  let comment: string
  if (recentPosts.length < MIN_POSTS_FOR_INSIGHT) {
    comment = NOT_ENOUGH_DATA_COMMENT
  } else {
    comment = FALLBACK_INSIGHT_COMMENT
    try {
      const totalCount = recentPosts.length
      const avg = (arr: typeof recentPosts) => arr.reduce((s, p) => s + p.score, 0) / arr.length

      // 件数が少ないと前半/後半に分けた際の件数表記が「投稿の総数」と誤解されやすいため、
      // 4件未満は分割せず全件の平均のみを使う。傾向比較は十分な件数がある時だけ行う
      let trendSection: string
      if (totalCount < 4) {
        const wholeAvg = Number(avg(recentPosts).toFixed(1))
        trendSection = `■保存されている投稿の総数: 全${totalCount}件\n■全${totalCount}件の気分平均: ${wholeAvg}/5`
      } else {
        const half = Math.ceil(totalCount / 2)
        const recentHalf = recentPosts.slice(0, half)
        const olderHalf = recentPosts.slice(half)
        const recentAvg = Number(avg(recentHalf).toFixed(1))
        const olderAvg = Number(avg(olderHalf).toFixed(1))
        let trend = '横ばい'
        if (recentAvg - olderAvg >= 0.4) trend = '上昇(良くなってきている)'
        else if (olderAvg - recentAvg >= 0.4) trend = '下降(下がってきている)'
        trendSection = `■保存されている投稿の総数: 全${totalCount}件
■そのうち直近${recentHalf.length}件の気分平均: ${recentAvg}/5
■それより前の${olderHalf.length}件の気分平均: ${olderAvg}/5
■傾向: ${trend}`
      }

      const latest = recentPosts[0]
      const latestLabel = SCORE_MEANING[latest.score] ?? String(latest.score)
      const latestCommentPart = latest.comment ? ` コメント:「${latest.comment}」` : ''

      const olderEntries = recentPosts.slice(1)
      const historyText = olderEntries
        .map((p) => {
          const label = SCORE_MEANING[p.score] ?? String(p.score)
          const commentPart = p.comment ? ` コメント:「${p.comment}」` : ''
          return `- ${p.createdAt} 気分:${label}(${p.score}/5)${commentPart}`
        })
        .join('\n')

      const prompt = `あなたは個人の気分の記録から傾向を読み取り、やさしくアドバイスするアシスタントです。
以下は、ある人の最新の投稿と、それより前の投稿記録(新しい順、日時付き)、そこから計算した数値、現在の東京の天気です。

【重要】件数に言及する場合は、必ず「保存されている投稿の総数」を使ってください。平均計算のために分割した一部の件数
(直近◯件など)を投稿の総数であるかのように書かないでください。
コメントの中心は必ず「最新の投稿」にしてください。最新の投稿の気分の値を、それより前の投稿の値と混同したり、
他の値をまとめて羅列したりしないでください。「以前は◯◯だったが、最新では◯◯」のように、最新の値を明確に区別して書いてください。
この人自身の気分の変化と天気との関連について、日本語で2〜3文、短く具体的にコメントしてください。
断定的な医療的表現や診断めいた言い方は避け、あくまで傾向の推測とやわらかいおすすめ行動を添えてください。
出力は日本語の文章のみで、前置きや箇条書き、見出しは不要です。二人称(「あなた」)で語りかけてください。

現在の東京の天気: ${weatherLabel ?? '不明'}${weatherTemp !== null ? `、気温${weatherTemp}℃` : ''}

■最新の投稿(必ずこれを中心に書く): ${latest.createdAt} 気分:${latestLabel}(${latest.score}/5)${latestCommentPart}

${trendSection}

■それより前の投稿記録(新しい順、参考情報):
${historyText || '(なし)'}`

      const aiResult = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: [{ role: 'user', content: prompt }],
      })) as { response?: string }
      if (aiResult.response?.trim()) {
        comment = aiResult.response.trim()
      }
    } catch (err) {
      console.error('generateUserInsight AI error', err)
      // AI生成失敗時は固定文にフォールバック
    }
  }

  const row: UserInsightRow = {
    weather_temp: weatherTemp,
    weather_code: weatherCode,
    weather_label: weatherLabel,
    post_count: recentPosts.length,
    comment,
    generated_at: new Date().toISOString(),
  }

  await env.DB.prepare(
    `INSERT INTO user_insights (user_id, weather_temp, weather_code, weather_label, post_count, comment, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       weather_temp = excluded.weather_temp,
       weather_code = excluded.weather_code,
       weather_label = excluded.weather_label,
       post_count = excluded.post_count,
       comment = excluded.comment,
       generated_at = excluded.generated_at`
  )
    .bind(
      userId,
      row.weather_temp,
      row.weather_code,
      row.weather_label,
      row.post_count,
      row.comment,
      row.generated_at
    )
    .run()

  return row
}

app.get('/api/insight', async (c) => {
  const userId = c.req.query('userId')
  if (!userId) {
    return c.json({ ok: false, error: 'userId required' }, 400)
  }

  const cached = await c.env.DB.prepare('SELECT * FROM user_insights WHERE user_id = ?')
    .bind(userId)
    .first<UserInsightRow>()
  const isStale = !cached || Date.now() - new Date(cached.generated_at).getTime() > INSIGHT_TTL_MS

  const row = isStale ? await generateUserInsight(c.env, userId) : cached

  return c.json({
    weather: row.weather_label
      ? {
          label: row.weather_label,
          emoji: row.weather_code !== null ? weatherCodeToLabel(row.weather_code).emoji : '☁️',
          temp: row.weather_temp,
        }
      : null,
    postCount: row.post_count,
    comment: row.comment,
    generatedAt: row.generated_at,
  })
})

app.get('/', async (c) => {
  c.header('Content-Type', 'text/html')
  return c.body(
    await renderToReadableStream(
      <html>
        <head>
          <ViteClient />
          <ReactRefresh />
          <Script src="/src/client/index.tsx" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap"
            rel="stylesheet"
          />
          <Link href="/src/style.css" rel="stylesheet" />
        </head>
        <body>
          <div id="root" />
        </body>
      </html>
    )
  )
})

export default app
