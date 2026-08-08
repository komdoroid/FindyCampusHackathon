import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  WARDS,
  WARD_MAP,
  WEATHER_LABEL,
  WEATHER_COLOR,
  SCORE_EMOJI,
  SCORE_COLOR,
  scoreToWeather,
  TOKYO23_BOUNDS,
  PIN_ZOOM_THRESHOLD,
  isPointInPolygon,
  polygonBounds,
  type Weather,
} from '../shared/wards'
import { WARD_POLYGONS } from '../shared/wardPolygons'

interface WardSummary {
  ward: string
  name: string
  count: number
  average: number | null
  enough: boolean
  weather: Weather | null
}

interface Alert {
  ward: string
  type: 'low' | 'high'
  message: string
}

interface Summary {
  wards: WardSummary[]
  total: number
  overall: number | null
  alerts: Alert[]
}

interface Post {
  id: number
  ward: string
  score: number
  comment: string | null
  createdAt: string
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

export function MapView({ onPostAgain }: { onPostAgain: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const blobLayersRef = useRef<Map<string, L.Polygon>>(new Map())
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
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
      minZoom: 10,
      maxZoom: 16,
      maxBounds: bounds.pad(0.1),
      maxBoundsViscosity: 1.0,
      zoomControl: true,
    })
    map.fitBounds(bounds)
    mapRef.current = map

    // 23区の範囲だけ表示すればよいので、負荷を抑えるため描画範囲を絞る
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
      bounds,
    }).addTo(map)

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

    // pin階層(拡大時)の時だけピンをDOMに追加する。ズームアウト中は空にして負荷を抑える
    function renderPins() {
      const layerGroup = pinLayerRef.current
      if (!layerGroup) return
      layerGroup.clearLayers()
      if (zoomTierRef.current !== 'pin') return

      for (const post of postsRef.current) {
        const ward = WARD_MAP[post.ward]
        if (!ward) continue
        const [lat, lng] = jitterPositionInWard(post.ward, post.id)
        const marker = L.marker([lat, lng], {
          pane: 'pinPane',
          icon: L.divIcon({
            className: 'mood-pin',
            html: `<div class="mood-pin-shape" style="border-color:${SCORE_COLOR[post.score]}">
              <span class="mood-pin-face">${SCORE_EMOJI[post.score]}</span>
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
    updateZoomTier()
    map.on('zoomend', updateZoomTier)

    return () => {
      map.off('zoomend', updateZoomTier)
      map.remove()
      mapRef.current = null
    }
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
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // 集計結果が更新されたらブロブの色とラベルを更新
  useEffect(() => {
    if (!summary) return
    const wardById = new Map(summary.wards.map((w) => [w.ward, w]))
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
    }
  }, [summary])

  // 投稿一覧が更新されたら、現在の表示階層に応じてピンを再描画する
  useEffect(() => {
    postsRef.current = posts
    renderPinsRef.current()
  }, [posts])

  return (
    <div className="map-view">
      <div className="map-overlay-top">
        <div className="overall">
          <span className="overall-label">東京全体</span>
          <span className="overall-value">
            {summary?.overall !== null && summary?.overall !== undefined
              ? `${summary.overall.toFixed(1)} ${WEATHER_LABEL[scoreToWeather(summary.overall)]}`
              : '集計中…'}
          </span>
        </div>
        <button type="button" className="post-again-btn" onClick={onPostAgain}>
          気分を投稿する
        </button>
      </div>

      {summary && summary.alerts.length > 0 && (
        <div className="alerts">
          {summary.alerts.map((a) => (
            <div key={a.ward} className={`alert alert-${a.type}`}>
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div ref={mapContainerRef} className="leaflet-container" />
    </div>
  )
}
