import { useEffect, useState } from 'react'
import { WARDS, findNearestWard, type WardDef } from '../shared/wards'
import { MoodFace } from './MoodFace'

type LocationState =
  | { status: 'locating' }
  | { status: 'found'; ward: WardDef }
  | { status: 'out_of_area' }
  | { status: 'manual' }

const LAST_POST_KEY = 'kibun-tenkizu:lastPostAt'

export function markPosted() {
  localStorage.setItem(LAST_POST_KEY, String(Date.now()))
}

export function getLastPostAt(): number | null {
  const raw = localStorage.getItem(LAST_POST_KEY)
  return raw ? Number(raw) : null
}

export function PostFlow({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [location, setLocation] = useState<LocationState>({ status: 'locating' })
  const [selectedWardId, setSelectedWardId] = useState<string>('')
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocation({ status: 'manual' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { ward } = findNearestWard(pos.coords.latitude, pos.coords.longitude)
        if (!ward) {
          setLocation({ status: 'out_of_area' })
        } else {
          setLocation({ status: 'found', ward })
        }
      },
      () => setLocation({ status: 'manual' }),
      { timeout: 8000 }
    )
  }, [])

  const activeWard: WardDef | null =
    location.status === 'found'
      ? location.ward
      : location.status === 'manual' && selectedWardId
        ? (WARDS.find((w) => w.id === selectedWardId) ?? null)
        : null

  async function handleSubmit() {
    if (!activeWard || score === null) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/moods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ward: activeWard.id,
          score,
          comment: comment || null,
          gender: null,
          ageGroup: null,
          userId,
        }),
      })
      if (!res.ok) throw new Error('failed')
      markPosted()
      onDone()
    } catch {
      setError('送信に失敗しました。もう一度お試しください')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="post-flow">
      <h1>今の気分をおしえてください</h1>

      {location.status === 'locating' && <p className="hint">現在地を取得しています…</p>}

      {location.status === 'out_of_area' && (
        <p className="hint error">23区の外にいるようです。この付近では投稿できません</p>
      )}

      {location.status === 'manual' && (
        <div className="ward-select">
          <p className="hint">位置情報が使えません。エリアを選んでください</p>
          <select value={selectedWardId} onChange={(e) => setSelectedWardId(e.target.value)}>
            <option value="">選択してください</option>
            {WARDS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeWard && (
        <>
          <p className="ward-display">{activeWard.name}にいます</p>

          <div className="score-buttons">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={score === n ? 'score-btn selected' : 'score-btn'}
                onClick={() => setScore(n)}
              >
                <MoodFace level={n as 1 | 2 | 3 | 4 | 5} size={36} />
              </button>
            ))}
          </div>
          <div className="score-labels">
            <span>雨</span>
            <span>晴れ</span>
          </div>

          <textarea
            maxLength={100}
            placeholder="ひとことどうぞ"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 100))}
          />

          {error && <p className="hint error">{error}</p>}

          <button
            type="button"
            className="submit-btn"
            disabled={score === null || submitting}
            onClick={handleSubmit}
          >
            {submitting ? '送信中…' : '投稿する'}
          </button>
        </>
      )}
    </div>
  )
}
