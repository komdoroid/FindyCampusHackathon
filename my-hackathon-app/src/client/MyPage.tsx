import { useEffect, useState } from 'react'
import { WARD_MAP, SCORE_EMOJI, WEATHER_LABEL, scoreToWeather } from '../shared/wards'
import { MoodPieChart, MoodLineChart, CommitCalendar } from './charts'

interface MyPost {
  id: number
  ward: string
  score: number
  comment: string | null
  createdAt: string
}

interface MineResponse {
  posts: MyPost[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface SummaryResponse {
  latest: { ward: string; score: number; comment: string | null; createdAt: string } | null
  totalPosts: number
  firstPostDate: string | null
  distribution: { score: number; count: number }[]
  dailyTrend: { date: string; average: number; count: number }[]
  calendar: { date: string; count: number }[]
}

function formatDate(iso: string): string {
  // DBの保存形式は "YYYY-MM-DD HH:MM:SS" (UTC)
  const d = new Date(`${iso.replace(' ', 'T')}Z`)
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Tab = 'profile' | 'calendar' | 'history'

export function MyPage({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <div className="mypage-page">
      <header className="mypage-header">
        <button type="button" className="mypage-back" onClick={onBack}>
          ← 地図にもどる
        </button>
        <h1>マイページ</h1>
      </header>

      <div className="mypage-layout">
        <nav className="mypage-menu">
          <button
            type="button"
            className={tab === 'profile' ? 'mypage-menu-item active' : 'mypage-menu-item'}
            onClick={() => setTab('profile')}
          >
            プロフィール
          </button>
          <button
            type="button"
            className={tab === 'calendar' ? 'mypage-menu-item active' : 'mypage-menu-item'}
            onClick={() => setTab('calendar')}
          >
            カレンダー
          </button>
          <button
            type="button"
            className={tab === 'history' ? 'mypage-menu-item active' : 'mypage-menu-item'}
            onClick={() => setTab('history')}
          >
            履歴
          </button>
        </nav>

        <div className="mypage-content">
          {tab === 'profile' && <ProfileTab userId={userId} />}
          {tab === 'calendar' && <CalendarTab userId={userId} />}
          {tab === 'history' && <HistoryTab userId={userId} />}
        </div>
      </div>
    </div>
  )
}

function ProfileTab({ userId }: { userId: string }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/moods/mine/summary?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((d: SummaryResponse) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (loading) return <p className="hint">読み込み中…</p>
  if (!data || data.totalPosts === 0) {
    return <p className="hint">まだ投稿がありません。気分を投稿すると、ここに記録が表示されます。</p>
  }

  const latest = data.latest
  const weather = latest ? scoreToWeather(latest.score) : null

  function handleShare() {
    if (!latest) return
    const text = `今日の気分は ${SCORE_EMOJI[latest.score]} でした #気分の天気図`
    const url = location.origin
    if (navigator.share) {
      navigator.share({ text, url }).catch(() => {})
    } else {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        '_blank'
      )
    }
  }

  return (
    <div className="profile-card">
      <div className="profile-card-grid">
        <div className="profile-recent">
          <span className="profile-recent-label">直近の記録</span>
          {latest ? (
            <>
              <span className="profile-recent-ward">{WARD_MAP[latest.ward]?.name ?? latest.ward}</span>
              <span className="profile-recent-mood">
                {SCORE_EMOJI[latest.score]} {weather ? WEATHER_LABEL[weather] : ''}
              </span>
              {latest.comment && <p className="profile-recent-comment">「{latest.comment}」</p>}
              <span className="profile-recent-date">{formatDate(latest.createdAt)}</span>
            </>
          ) : (
            <span className="hint">まだ投稿がありません</span>
          )}
          <span className="profile-total">累計投稿数: {data.totalPosts}件</span>
        </div>

        <div className="profile-pie">
          <span className="profile-chart-label">気分の割合</span>
          <MoodPieChart distribution={data.distribution} />
        </div>

        <div className="profile-line">
          <span className="profile-chart-label">直近7日の推移</span>
          <MoodLineChart dailyTrend={data.dailyTrend} />
        </div>
      </div>

      <button type="button" className="profile-share-btn" onClick={handleShare}>
        SNSでシェア
      </button>
    </div>
  )
}

function CalendarTab({ userId }: { userId: string }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/moods/mine/summary?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((d: SummaryResponse) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (loading) return <p className="hint">読み込み中…</p>
  if (!data) return null

  return (
    <div className="calendar-tab">
      <p className="mypage-sub">投稿した日ほど色が濃くなります(直近13週間)</p>
      <CommitCalendar calendar={data.calendar} />
    </div>
  )
}

function HistoryTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<MineResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/moods/mine?userId=${encodeURIComponent(userId)}&page=${page}`)
      .then((res) => res.json())
      .then((d: MineResponse) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, page])

  return (
    <div className="mypage">
      <p className="mypage-sub">{data ? `全${data.total}件` : ''}</p>

      {loading && <p className="hint">読み込み中…</p>}
      {!loading && data && data.posts.length === 0 && <p className="hint">まだ投稿がありません</p>}

      {!loading && data && data.posts.length > 0 && (
        <div className="mypage-list">
          {data.posts.map((p) => (
            <div key={p.id} className="mypage-row">
              <span className="mypage-date">{formatDate(p.createdAt)}</span>
              <span className="mypage-emoji">{SCORE_EMOJI[p.score]}</span>
              <span className="mypage-ward">{WARD_MAP[p.ward]?.name ?? p.ward}</span>
              <span className="mypage-comment">{p.comment ?? ''}</span>
            </div>
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="mypage-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            前へ
          </button>
          <span>
            {page} / {data.totalPages}
          </span>
          <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            次へ
          </button>
        </div>
      )}
    </div>
  )
}
