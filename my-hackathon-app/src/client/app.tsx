import { useState } from 'react'
import { PostFlow, getLastPostAt } from './PostFlow'
import { MapView } from './MapView'
import { MyPage } from './MyPage'
import { Modal } from './Modal'
import { getUserId } from './identity'
import { WINDOW_HOURS } from '../shared/wards'

// デモ用: URLに ?demo=1 を付けると6時間制限を無視して常に投稿画面を出す
const isDemoMode = new URLSearchParams(location.search).has('demo')

function shouldShowPostFlow(): boolean {
  if (isDemoMode) return true
  const lastPostAt = getLastPostAt()
  if (lastPostAt === null) return true
  const elapsedHours = (Date.now() - lastPostAt) / (1000 * 60 * 60)
  return elapsedHours >= WINDOW_HOURS
}

type View = 'map' | 'mypage'

function App() {
  const [userId] = useState(getUserId)
  const [view, setView] = useState<View>('map')
  const [showPostFlow, setShowPostFlow] = useState(shouldShowPostFlow)
  const [postVersion, setPostVersion] = useState(0)

  return (
    <>
      {/* マイページ表示中もMapViewをアンマウントしない。地図に戻るたびにLeafletの再初期化と
          summary/posts/insightの再フェッチが走り、反映が遅く見える・シームレスでなくなるのを防ぐ */}
      <div className={view === 'map' ? undefined : 'view-hidden'}>
        <MapView
          userId={userId}
          refreshKey={postVersion}
          active={view === 'map'}
          onPostAgain={() => setShowPostFlow(true)}
          onOpenMyPage={() => setView('mypage')}
        />
      </div>

      {view === 'mypage' && <MyPage userId={userId} onBack={() => setView('map')} />}

      {showPostFlow && (
        <Modal size="compact" onClose={() => setShowPostFlow(false)}>
          <PostFlow
            userId={userId}
            onDone={() => {
              setShowPostFlow(false)
              setPostVersion((v) => v + 1)
            }}
          />
        </Modal>
      )}
    </>
  )
}

export default App
