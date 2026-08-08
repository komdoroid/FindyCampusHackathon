import { useEffect, useState } from 'react'
import { WARD_MAP, SCORE_EMOJI, WEATHER_LABEL, scoreToWeather } from '../shared/wards'
import { MoodPieChart, MoodLineChart, CommitCalendar } from './charts'
import { MoodFace, type MoodLevel } from './MoodFace'

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

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.014 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.014 8.333 0 8.74 0 12s.014 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.986 8.74 24 12 24s3.667-.014 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.014-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.014 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  )
}

function IconThreads() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.291 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.404 3.61 8.837 3.586 12c.024 3.164.72 5.596 2.06 7.23 1.43 1.783 3.63 2.696 6.54 2.717 2.623-.02 4.358-.64 5.8-2.075 1.641-1.633 1.613-3.636 1.088-4.85-.309-.717-.87-1.313-1.629-1.756-.19 1.358-.617 2.44-1.276 3.222-.885 1.05-2.147 1.625-3.756 1.71-1.216.064-2.39-.226-3.301-.816-1.08-.697-1.71-1.756-1.775-2.98-.13-2.42 1.8-4.164 4.802-4.34.9-.053 1.744-.014 2.522.114-.104-.63-.317-1.13-.634-1.49-.436-.494-1.11-.744-2.004-.75h-.024c-.72 0-1.71.2-2.34 1.147l-1.756-1.2c.844-1.26 2.216-1.955 3.868-1.955h.03c2.762.017 4.406 1.708 4.57 4.69.096.017.19.036.284.056 1.31.286 2.36.98 3.033 2.008.933 1.428 1.024 3.76-.905 5.674-1.76 1.75-3.9 2.545-6.945 2.567z" />
    </svg>
  )
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
    </svg>
  )
}

function ProfileTab({ userId }: { userId: string }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareNotice, setShareNotice] = useState<string | null>(null)

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

  function shareText() {
    if (!latest) return ''
    return `今日の気分は ${SCORE_EMOJI[latest.score]} でした #気分の天気図`
  }

  function handleShareX() {
    if (!latest) return
    const url = location.origin
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  function handleShareThreads() {
    if (!latest) return
    const text = `${shareText()} ${location.origin}`
    window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  function handleShareInstagram() {
    if (!latest) return
    const text = `${shareText()} ${location.origin}`
    // Instagramは投稿文言を事前入力するWeb intentがないため、テキストをコピーしてアプリ/サイトを開く
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setShareNotice('テキストをコピーしました。Instagramで貼り付けて投稿してください')
        setTimeout(() => setShareNotice(null), 3500)
      })
      .catch(() => {})
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
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
                <MoodFace level={latest.score as MoodLevel} size={26} /> {weather ? WEATHER_LABEL[weather] : ''}
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

      <div className="profile-share-row">
        <button
          type="button"
          className="profile-share-icon instagram"
          onClick={handleShareInstagram}
          aria-label="Instagramでシェア"
          title="Instagramでシェア"
        >
          <IconInstagram />
        </button>
        <button
          type="button"
          className="profile-share-icon threads"
          onClick={handleShareThreads}
          aria-label="Threadsでシェア"
          title="Threadsでシェア"
        >
          <IconThreads />
        </button>
        <button
          type="button"
          className="profile-share-icon x"
          onClick={handleShareX}
          aria-label="Xでシェア"
          title="Xでシェア"
        >
          <IconX />
        </button>
      </div>
      {shareNotice && <p className="profile-share-notice">{shareNotice}</p>}
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
              <span className="mypage-emoji">
                <MoodFace level={p.score as MoodLevel} size={22} />
              </span>
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
