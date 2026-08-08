import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  WARDS,
  WARD_MAP,
  WEATHER_LABEL,
  WEATHER_COLOR,
  SCORE_COLOR,
  scoreToWeather,
  findNearestWard,
  TOKYO23_BOUNDS,
  PIN_ZOOM_THRESHOLD,
  isPointInPolygon,
  polygonBounds,
  type Weather,
  type WardDef,
} from '../shared/wards'
import { WARD_POLYGONS } from '../shared/wardPolygons'
import { MoodFace, moodFaceMarkup, weatherToMoodLevel, type MoodLevel } from './MoodFace'

interface WardSummary {
  ward: string
  name: string
  count: number
  average: number | null
  enough: boolean
  weather: Weather | null
}

interface Summary {
  wards: WardSummary[]
  total: number
  overall: number | null
}

interface Post {
  id: number
  ward: string
  score: number
  comment: string | null
  userId: string | null
  createdAt: string
}

interface LatestPost {
  ward: string
  score: number
  comment: string | null
  createdAt: string
}

interface Insight {
  weather: { label: string; emoji: string; temp: number | null } | null
  postCount: number
  comment: string
  generatedAt: string
  latestPost: LatestPost | null
}

function formatDateTime(iso: string): string {
  // DBの保存形式は "YYYY-MM-DD HH:MM:SS" (UTC)
  const d = new Date(`${iso.replace(' ', 'T')}Z`)
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const REFRESH_MS = 30_000
const TOKYO_CENTER: [number, number] = [35.6895, 139.7]

// 投稿idから決まる疑似乱数(0〜1)。リフレッシュのたびにピンの位置が飛ばないよう固定。
// sin()ベースの安易なハッシュは連続整数に対して周期的な偏りが出るため、
// よく混ざるMurmurHash3のfinalizerを使う
function pseudoRandom(seed: number): number {
  let h = seed | 0
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const wardBoundsCache = new Map<string, ReturnType<typeof polygonBounds>>()
const wardCentroidCache = new Map<string, [number, number]>()

// 区の天気バッジを置く位置(ポリゴン頂点の重心)。区ごとに固定なのでキャッシュする
function wardCentroid(wardId: string): [number, number] {
  let centroid = wardCentroidCache.get(wardId)
  if (centroid) return centroid
  const polygon = WARD_POLYGONS[wardId]
  const fallback = WARD_MAP[wardId]
  if (!polygon || polygon.length === 0) {
    centroid = [fallback.lat, fallback.lng]
  } else {
    let sumLat = 0
    let sumLng = 0
    for (const [lat, lng] of polygon) {
      sumLat += lat
      sumLng += lng
    }
    centroid = [sumLat / polygon.length, sumLng / polygon.length]
  }
  wardCentroidCache.set(wardId, centroid)
  return centroid
}

// 区の実際のポリゴン内に収まる位置を疑似乱数で決める(棄却サンプリング)
function jitterPositionInWard(wardId: string, id: number): [number, number] {
  const polygon = WARD_POLYGONS[wardId]
  const fallback = WARD_MAP[wardId]
  if (!polygon) return [fallback.lat, fallback.lng]

  let bounds = wardBoundsCache.get(wardId)
  if (!bounds) {
    bounds = polygonBounds(polygon)
    wardBoundsCache.set(wardId, bounds)
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const lat = bounds.minLat + pseudoRandom(id * 3 + attempt * 97 + 1) * (bounds.maxLat - bounds.minLat)
    const lng = bounds.minLng + pseudoRandom(id * 5 + attempt * 97 + 2) * (bounds.maxLng - bounds.minLng)
    if (isPointInPolygon(lat, lng, polygon)) {
      return [lat, lng]
    }
  }
  return [fallback.lat, fallback.lng]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function MapView({
  userId,
  refreshKey,
  onPostAgain,
  onOpenMyPage,
}: {
  userId: string
  refreshKey: number
  onPostAgain: () => void
  onOpenMyPage: () => void
}) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [insight, setInsight] = useState<Insight | null>(null)
  const [currentWard, setCurrentWard] = useState<WardDef | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const blobLayersRef = useRef<Map<string, L.Polygon>>(new Map())
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const labelLayerRef = useRef<L.LayerGroup | null>(null)
  const zoomTierRef = useRef<'far' | 'pin'>('far')
  const postsRef = useRef<Post[]>([])
  const renderPinsRef = useRef<() => void>(() => {})

  // 地図の初期化(1回だけ)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const bounds = L.latLngBounds(TOKYO23_BOUNDS)

    const map = L.map(mapContainerRef.current, {
      center: TOKYO_CENTER,
      zoom: 11,
      maxZoom: 16,
      maxBoundsViscosity: 1.0,
      zoomControl: true,
    })
    mapRef.current = map

    // 23区の範囲だけ表示すればよいので、負荷を抑えるため描画範囲を絞る。
    // 標準OSMタイルは道路が原色で主張しすぎるため、地名が日本語表記のまま
    // 淡い配色になる国土地理院の淡色地図タイルを使い、上に乗せるポップな色と喧嘩しないようにする
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
      maxZoom: 18,
      bounds,
    }).addTo(map)

    // コンテナの縦横比とboundsの縦横比が一致しないと、fitBoundsだけでは
    // 片側に地図の描画範囲外(灰色)が余ってしまう。CSSのbackground-size:coverと同じ考え方で、
    // boundsが常にコンテナ全体を覆う最小ズームを求めて固定する
    function coverZoom(): number {
      const size = map.getSize()
      if (size.x === 0 || size.y === 0) return 11
      for (let z = 10; z <= 16; z++) {
        const nw = map.project(bounds.getNorthWest(), z)
        const se = map.project(bounds.getSouthEast(), z)
        if (Math.abs(se.x - nw.x) >= size.x && Math.abs(se.y - nw.y) >= size.y) return z
      }
      return 16
    }

    function applyCoverFit() {
      const z = coverZoom()
      map.setMinZoom(z)
      map.setMaxBounds(bounds.pad(0.1))
      if (map.getZoom() < z) map.setZoom(z)
      else map.panInsideBounds(bounds, { animate: false })
    }

    applyCoverFit()
    // 初回描画直後はコンテナの実サイズが確定していないことがあるため、次フレームでも補正する
    requestAnimationFrame(applyCoverFit)

    function handleWindowResize() {
      map.invalidateSize()
      applyCoverFit()
    }
    window.addEventListener('resize', handleWindowResize)

    map.createPane('blobPane')
    const blobPane = map.getPane('blobPane')!
    blobPane.style.opacity = '0.75'
    blobPane.style.zIndex = '450'

    // 独自paneに描くとLeafletが自前でpadding付きのレンダラーを作ってしまい、
    // ぼかしが縁でクリップされたりパン時にズレたりする原因になっていた。
    // paddingを広めに確保した専用レンダラーを明示的に使う
    const blobRenderer = L.svg({ pane: 'blobPane', padding: 2 }).addTo(map)
    const blobSvgRoot = (blobRenderer as unknown as { _container: SVGSVGElement })._container
    const svgNs = 'http://www.w3.org/2000/svg'
    const defs = document.createElementNS(svgNs, 'defs')
    const filter = document.createElementNS(svgNs, 'filter')
    filter.setAttribute('id', 'cloud-blur')
    filter.setAttribute('x', '-50%')
    filter.setAttribute('y', '-50%')
    filter.setAttribute('width', '200%')
    filter.setAttribute('height', '200%')
    const blur = document.createElementNS(svgNs, 'feGaussianBlur')
    blur.setAttribute('stdDeviation', '5')
    filter.appendChild(blur)
    defs.appendChild(filter)
    blobSvgRoot.insertBefore(defs, blobSvgRoot.firstChild)

    map.createPane('labelPane')
    const labelPane = map.getPane('labelPane')!
    labelPane.style.zIndex = '650'

    map.createPane('pinPane')
    const pinPane = map.getPane('pinPane')!
    pinPane.style.zIndex = '640'

    const layers = new Map<string, L.Polygon>()
    for (const w of WARDS) {
      const polygon = WARD_POLYGONS[w.id]
      if (!polygon) continue
      const shape = L.polygon(polygon, {
        pane: 'blobPane',
        renderer: blobRenderer,
        color: 'transparent',
        weight: 0,
        fillColor: '#cccccc',
        fillOpacity: 0,
      }).addTo(map)
      shape.getElement()?.setAttribute('filter', 'url(#cloud-blur)')
      layers.set(w.id, shape)
    }
    blobLayersRef.current = layers
    pinLayerRef.current = L.layerGroup().addTo(map)
    labelLayerRef.current = L.layerGroup().addTo(map)

    // pin階層(拡大時)の時だけピンをDOMに追加する。ズームアウト中は空にして負荷を抑える。
    // 投稿数が多いと全件分のDOM(コメント付きは常時吹き出し表示まで)を作ることになり重くなるため、
    // 今見えている範囲(+少し余裕)に入っているものだけを描画する
    function renderPins() {
      const layerGroup = pinLayerRef.current
      if (!layerGroup) return
      layerGroup.clearLayers()
      if (zoomTierRef.current !== 'pin') return

      const visibleBounds = map.getBounds().pad(0.2)

      for (const post of postsRef.current) {
        const ward = WARD_MAP[post.ward]
        if (!ward) continue
        const [lat, lng] = jitterPositionInWard(post.ward, post.id)
        if (!visibleBounds.contains([lat, lng])) continue
        const mine = post.userId !== null && post.userId === userId
        const marker = L.marker([lat, lng], {
          pane: 'pinPane',
          icon: L.divIcon({
            className: mine ? 'mood-pin mood-pin-mine' : 'mood-pin',
            html: `<div class="mood-pin-shape" style="border-color:${SCORE_COLOR[post.score]}">
              <span class="mood-pin-face">${moodFaceMarkup(post.score as 1 | 2 | 3 | 4 | 5, 26)}</span>
              ${mine ? '<span class="mood-pin-mine-badge">★</span>' : ''}
            </div>`,
            // 涙型の先端は見た目上ボックス上端から40pxの位置にあるため、
            // アンカーもそこに合わせて実際の座標とズレないようにする
            iconSize: [44, 60],
            iconAnchor: [22, 40],
          }),
        })
        if (post.comment) {
          marker.bindTooltip(`<div class="mood-bubble">${escapeHtml(post.comment)}</div>`, {
            permanent: true,
            direction: 'top',
            // 顔の円(高さ40px)より上に十分な間隔を空けて吹き出しと被らないようにする
            offset: [0, -48],
            className: 'mood-popup',
          })
        }
        layerGroup.addLayer(marker)
      }
    }
    renderPinsRef.current = renderPins

    function currentTier(zoom: number): 'far' | 'pin' {
      return zoom >= PIN_ZOOM_THRESHOLD ? 'pin' : 'far'
    }

    function updateZoomTier() {
      const el = mapContainerRef.current
      if (!el) return
      const tier = currentTier(map.getZoom())
      const tierChanged = tier !== zoomTierRef.current
      zoomTierRef.current = tier
      el.classList.toggle('pins-visible', tier === 'pin')
      // 個別ピンが見える段階では雲(ブロブ)を消す。遠景の一覧性のためだけの表現なので
      blobPane.style.opacity = tier === 'far' ? '0.75' : '0'
      if (tierChanged) renderPins()
    }
    // ピン表示中にパンした時も、表示範囲が変わるので描画し直す
    function handleMoveEnd() {
      if (zoomTierRef.current === 'pin') renderPins()
    }
    updateZoomTier()
    map.on('zoomend', updateZoomTier)
    map.on('moveend', handleMoveEnd)

    return () => {
      map.off('zoomend', updateZoomTier)
      map.off('moveend', handleMoveEnd)
      window.removeEventListener('resize', handleWindowResize)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 現在地の区を判定して左上に表示する(位置情報が使えない/拒否時は何も表示しない)
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { ward } = findNearestWard(pos.coords.latitude, pos.coords.longitude)
        setCurrentWard(ward)
      },
      () => {
        // 取得できない場合は何も表示しない
      },
      { timeout: 8000 }
    )
  }, [])

  // データ取得・自動更新
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [summaryRes, postsRes] = await Promise.all([
          fetch('/api/summary'),
          fetch('/api/moods/recent'),
        ])
        const summaryData = (await summaryRes.json()) as Summary
        const postsData = (await postsRes.json()) as { posts: Post[] }
        if (!cancelled) {
          setSummary(summaryData)
          setPosts(postsData.posts)
        }
      } catch {
        // 次回の自動更新に任せる
      }
    }
    async function loadInsight() {
      try {
        const res = await fetch(`/api/insight?userId=${encodeURIComponent(userId)}`)
        const data = (await res.json()) as Insight
        if (!cancelled) setInsight(data)
      } catch {
        // 次回の自動更新に任せる
      }
    }
    load()
    loadInsight()
    const id = setInterval(load, REFRESH_MS)
    // サーバー側で数分単位のキャッシュをしているため、こちらは低頻度のポーリングでよい
    const insightId = setInterval(loadInsight, REFRESH_MS * 10)
    return () => {
      cancelled = true
      clearInterval(id)
      clearInterval(insightId)
    }
    // refreshKeyは投稿完了時にインクリメントされる。投稿直後にsummary/posts/insightを
    // 即座に再取得するためのトリガーとしてのみ使う
  }, [userId, refreshKey])

  // 集計結果が更新されたらブロブの色とラベルを更新
  useEffect(() => {
    if (!summary) return
    const wardById = new Map(summary.wards.map((w) => [w.ward, w]))
    const labelGroup = labelLayerRef.current
    labelGroup?.clearLayers()
    for (const w of WARDS) {
      const stat = wardById.get(w.id)
      const hasData = Boolean(stat?.enough && stat.weather)
      const shape = blobLayersRef.current.get(w.id)
      if (shape) {
        // データ不足の区は仕様どおり色をつけない(=雲を表示しない)
        shape.setStyle({
          fillColor: hasData ? WEATHER_COLOR[stat!.weather!] : '#cccccc',
          fillOpacity: hasData ? 0.55 : 0,
        })
      }
      // 遠景時、雲の上に天気の絵文字バッジを乗せてひと目で分かるポップな見た目にする
      if (hasData && labelGroup) {
        const [lat, lng] = wardCentroid(w.id)
        const marker = L.marker([lat, lng], {
          pane: 'labelPane',
          interactive: false,
          icon: L.divIcon({
            className: 'ward-emoji-badge',
            html: `<div class="ward-emoji-badge-inner">${moodFaceMarkup(weatherToMoodLevel(stat!.weather!), 26)}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
        })
        labelGroup.addLayer(marker)
      }
    }
  }, [summary])

  // 投稿一覧が更新されたら、現在の表示階層に応じてピンを再描画する
  useEffect(() => {
    postsRef.current = posts
    renderPinsRef.current()
  }, [posts])

  return (
    <div className="map-view">
      <header className="map-header">
        <div className="map-header-nav">
          <button type="button" className="map-header-nav-btn map-header-nav-btn-primary" onClick={onPostAgain}>
            気分を投稿する
          </button>
          <button type="button" className="map-header-nav-btn" onClick={onOpenMyPage}>
            マイページ
          </button>
        </div>

        {insight?.latestPost && (
          <>
            <div className="map-header-post">
              <MoodFace level={insight.latestPost.score as MoodLevel} size={40} />
              <div className="map-header-post-text">
                <span className="map-header-post-ward">
                  {WARD_MAP[insight.latestPost.ward]?.name ?? insight.latestPost.ward}
                  <span className="map-header-post-time">{formatDateTime(insight.latestPost.createdAt)}</span>
                </span>
                {insight.latestPost.comment && (
                  <span className="map-header-post-comment">「{insight.latestPost.comment}」</span>
                )}
              </div>
            </div>
            {insight.comment && (
              <div className="map-header-ai">
                <span className="map-header-ai-tag">AIによるあなたの気分分析</span>
                <p className="map-header-ai-comment">{insight.comment}</p>
              </div>
            )}
          </>
        )}
      </header>

      <div className="map-canvas">
        <div className="map-overlay-top">
          <div className="overall">
            {currentWard && <span className="current-ward">📍 {currentWard.name}</span>}
            <span className="overall-label">東京全体の気分</span>
            <span className="overall-value">
              {summary?.overall !== null && summary?.overall !== undefined
                ? `${summary.overall.toFixed(1)} ${WEATHER_LABEL[scoreToWeather(summary.overall)]}`
                : '集計中…'}
            </span>
            {insight?.weather && (
              <span className="overall-real-weather">
                天気: {insight.weather.emoji} {insight.weather.label}
                {insight.weather.temp !== null ? ` ${insight.weather.temp.toFixed(0)}℃` : ''}
              </span>
            )}
          </div>
        </div>

        <div ref={mapContainerRef} className="leaflet-container" />
      </div>
    </div>
  )
}
