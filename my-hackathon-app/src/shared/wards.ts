export interface WardDef {
  id: string
  name: string
  lat: number
  lng: number
  row: number
  col: number
}

// 代表座標: 各区役所付近の緯度経度
// タイル配置: 仕様書の格子(行1〜行6)に基づく row/col
export const WARDS: WardDef[] = [
  { id: 'itabashi', name: '板橋区', lat: 35.7512, lng: 139.7093, row: 1, col: 3 },
  { id: 'kita', name: '北区', lat: 35.7526, lng: 139.7336, row: 1, col: 4 },
  { id: 'adachi', name: '足立区', lat: 35.775, lng: 139.8047, row: 1, col: 5 },

  { id: 'nerima', name: '練馬区', lat: 35.7357, lng: 139.6516, row: 2, col: 2 },
  { id: 'toshima', name: '豊島区', lat: 35.7263, lng: 139.7169, row: 2, col: 3 },
  { id: 'arakawa', name: '荒川区', lat: 35.7362, lng: 139.7834, row: 2, col: 4 },
  { id: 'katsushika', name: '葛飾区', lat: 35.7434, lng: 139.8474, row: 2, col: 5 },

  { id: 'nakano', name: '中野区', lat: 35.7075, lng: 139.6638, row: 3, col: 1 },
  { id: 'shinjuku', name: '新宿区', lat: 35.6938, lng: 139.7036, row: 3, col: 2 },
  { id: 'bunkyo', name: '文京区', lat: 35.7081, lng: 139.7524, row: 3, col: 3 },
  { id: 'taito', name: '台東区', lat: 35.7128, lng: 139.7799, row: 3, col: 4 },
  { id: 'sumida', name: '墨田区', lat: 35.7107, lng: 139.8016, row: 3, col: 5 },
  { id: 'edogawa', name: '江戸川区', lat: 35.7066, lng: 139.8683, row: 3, col: 6 },

  { id: 'suginami', name: '杉並区', lat: 35.6994, lng: 139.6363, row: 4, col: 1 },
  { id: 'shibuya', name: '渋谷区', lat: 35.6642, lng: 139.6982, row: 4, col: 2 },
  { id: 'chiyoda', name: '千代田区', lat: 35.694, lng: 139.7536, row: 4, col: 3 },
  { id: 'chuo', name: '中央区', lat: 35.6706, lng: 139.7720, row: 4, col: 4 },
  { id: 'koto', name: '江東区', lat: 35.6729, lng: 139.8172, row: 4, col: 5 },

  { id: 'setagaya', name: '世田谷区', lat: 35.6464, lng: 139.6533, row: 5, col: 1 },
  { id: 'meguro', name: '目黒区', lat: 35.6414, lng: 139.6983, row: 5, col: 2 },
  { id: 'minato', name: '港区', lat: 35.6581, lng: 139.7514, row: 5, col: 3 },

  { id: 'ota', name: '大田区', lat: 35.5614, lng: 139.7161, row: 6, col: 1 },
  { id: 'shinagawa', name: '品川区', lat: 35.6092, lng: 139.7302, row: 6, col: 2 },
]

export const WARD_MAP: Record<string, WardDef> = Object.fromEntries(WARDS.map((w) => [w.id, w]))

export function isValidWardId(id: string): boolean {
  return id in WARD_MAP
}

// 最寄りの区までこの距離(km)以上離れていたら区外扱い
export const OUT_OF_AREA_KM = 15

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

// ハーサバイン公式で2点間の距離(km)を計算
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function findNearestWard(lat: number, lng: number): { ward: WardDef | null; distanceKm: number } {
  let nearest: WardDef | null = null
  let minDist = Infinity
  for (const w of WARDS) {
    const d = distanceKm(lat, lng, w.lat, w.lng)
    if (d < minDist) {
      minDist = d
      nearest = w
    }
  }
  if (nearest && minDist > OUT_OF_AREA_KM) {
    return { ward: null, distanceKm: minDist }
  }
  return { ward: nearest, distanceKm: minDist }
}

// 集計の閾値。当日データを見て調整するためここに集約する
export const MIN_COUNT = 3
export const WINDOW_HOURS = 6

export type Weather = 'rain' | 'rain_cloud' | 'cloud' | 'sunny'

export function scoreToWeather(average: number): Weather {
  if (average <= 2.0) return 'rain'
  if (average <= 2.8) return 'rain_cloud'
  if (average <= 3.5) return 'cloud'
  return 'sunny'
}

export const WEATHER_LABEL: Record<Weather, string> = {
  rain: '雨',
  rain_cloud: 'くもり時々雨',
  cloud: 'くもり',
  sunny: '晴れ',
}

export const WEATHER_COLOR: Record<Weather, string> = {
  rain: '#4a7fd6',
  rain_cloud: '#8fc7d9',
  cloud: '#9aa0a6',
  sunny: '#f5a623',
}

export const WEATHER_EMOJI: Record<Weather, string> = {
  rain: '😢',
  rain_cloud: '😟',
  cloud: '😐',
  sunny: '😄',
}

// 気分入力ボタン(1〜5)用の5段階ニコチャンマーク
export const SCORE_EMOJI: Record<number, string> = {
  1: '😭',
  2: '😟',
  3: '🙂',
  4: '😄',
  5: '🤩',
}

// 個別ピン用の5段階カラー。中央の3(😐)はグレーだとネガティブに見えるため緑にし、
// 青→水色→緑→黄→オレンジの気分グラデーションにする
export const SCORE_COLOR: Record<number, string> = {
  1: '#4a7fd6',
  2: '#4fb0c6',
  3: '#4caf50',
  4: '#ffca28',
  5: '#f5a623',
}

// 23区がすっぽり収まる範囲。地図の表示範囲をこの中に制限して負荷を抑える
export const TOKYO23_BOUNDS: [[number, number], [number, number]] = [
  [35.5, 139.54],
  [35.83, 139.93],
]

// ズームの3段階: 雲のみ → 区平均バッジ → 個別ピン
export const WARD_BADGE_ZOOM_THRESHOLD = 13
export const PIN_ZOOM_THRESHOLD = 15

// 点(lat,lng)がポリゴン内に入っているか(レイキャスティング法)
export function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i]
    const [latJ, lngJ] = polygon[j]
    const intersect =
      lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonBounds(polygon: [number, number][]): {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
} {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const [lat, lng] of polygon) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return { minLat, maxLat, minLng, maxLng }
}
