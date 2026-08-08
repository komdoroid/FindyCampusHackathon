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

  if (view === 'mypage') {
    return <MyPage userId={userId} onBack={() => setView('map')} />
  }

  return (
    <>
      <MapView
        userId={userId}
        onPostAgain={() => setShowPostFlow(true)}
        onOpenMyPage={() => setView('mypage')}
      />

      {showPostFlow && (
        <Modal size="compact" onClose={() => setShowPostFlow(false)}>
          <PostFlow userId={userId} onDone={() => setShowPostFlow(false)} />
        </Modal>
      )}
    </>
  )
}

export default App
