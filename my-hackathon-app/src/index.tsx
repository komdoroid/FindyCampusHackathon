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

  const { ward, score, comment, gender, ageGroup } = body as Record<string, unknown>

  if (typeof ward !== 'string' || !isValidWardId(ward)) {
    return c.json({ ok: false, error: 'invalid ward' }, 400)
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
    return c.json({ ok: false, error: 'invalid score' }, 400)
  }
  const trimmedComment = typeof comment === 'string' ? comment.slice(0, 100) : null
  const genderValue = typeof gender === 'string' ? gender : null
  const ageGroupValue = typeof ageGroup === 'string' ? ageGroup : null

  await c.env.DB.prepare(
    'INSERT INTO moods (ward, score, comment, gender, age_group) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(ward, score, trimmedComment, genderValue, ageGroupValue)
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
    `SELECT id, ward, score, comment, created_at as createdAt
     FROM moods
     WHERE created_at >= datetime('now', ?)
     ORDER BY created_at DESC
     LIMIT 2000`
  )
    .bind(`-${WINDOW_HOURS} hours`)
    .all<{ id: number; ward: string; score: number; comment: string | null; createdAt: string }>()

  return c.json({ posts: results })
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
