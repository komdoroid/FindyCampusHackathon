import { useState } from 'react'
import { PostFlow, getLastPostAt } from './PostFlow'
import { MapView } from './MapView'
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

function App() {
  const [showPostFlow, setShowPostFlow] = useState(shouldShowPostFlow)

  if (showPostFlow) {
    return <PostFlow onDone={() => setShowPostFlow(false)} />
  }
  return <MapView onPostAgain={() => setShowPostFlow(true)} />
}

export default App
