import { SCORE_COLOR, type Weather } from '../shared/wards'

export type MoodLevel = 1 | 2 | 3 | 4 | 5

// 区の天気(4段階)もキャラクターの顔で表現するため、5段階の気分レベルに割り当てる
export function weatherToMoodLevel(weather: Weather): MoodLevel {
  if (weather === 'rain') return 1
  if (weather === 'rain_cloud') return 2
  if (weather === 'cloud') return 3
  return 5
}

const INK = '#2b2b2b'

// カートゥーン調の目(白目+黒目+ハイライト)。開いた目の3段階(2〜4)で共通して使う
function cartoonEye(cx: number, cy: number, pupilDx: number, pupilDy: number): string {
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="5.4" ry="6.4" fill="#fff" stroke="${INK}" stroke-width="2.2" />
    <circle cx="${cx + pupilDx}" cy="${cy + pupilDy}" r="2.7" fill="${INK}" />
    <circle cx="${cx + pupilDx + 1}" cy="${cy + pupilDy - 1.1}" r="1" fill="#fff" />
  `
}

function eyesFor(level: MoodLevel): string {
  switch (level) {
    case 1:
    case 5:
      // ぎゅっと閉じた目(1=つらい、5=うれしい)。どちらも同じアーチ形だが
      // 眉・涙・口の組み合わせで表情の意味が変わる
      return `
        <path d="M17 30 Q22 24 27 30" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" />
        <path d="M37 30 Q42 24 47 30" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" />
      `
    case 2:
      return cartoonEye(21.5, 31, -0.6, 1.4) + cartoonEye(42.5, 31, -0.6, 1.4)
    case 4:
      return cartoonEye(21.5, 29.5, 0.8, -0.6) + cartoonEye(42.5, 29.5, 0.8, -0.6)
    default:
      return cartoonEye(21.5, 30.5, 0, 0) + cartoonEye(42.5, 30.5, 0, 0)
  }
}

function browsFor(level: MoodLevel): string {
  if (level === 1) {
    return `
      <path d="M13 20 L26 25.5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" />
      <path d="M51 20 L38 25.5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" />
    `
  }
  if (level === 2) {
    return `
      <path d="M15 22 L26 25.5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" />
      <path d="M49 22 L38 25.5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" />
    `
  }
  return ''
}

function mouthFor(level: MoodLevel): string {
  switch (level) {
    case 1:
      return `
        <ellipse cx="32" cy="47" rx="7.5" ry="8.5" fill="${INK}" />
        <ellipse cx="32" cy="47" rx="6" ry="7" fill="#5a3838" />
        <ellipse cx="32" cy="49.5" rx="3.4" ry="4" fill="#87504f" />
      `
    case 2:
      return `<path d="M24 48 Q32 42 40 48" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" />`
    case 4:
      return `<path d="M23 44 Q32 53 41 44" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" />`
    case 5:
      return `
        <path d="M18 41 Q32 61 46 41 Z" fill="${INK}" />
        <path d="M18 41 Q32 61 46 41 Q32 52 18 41 Z" fill="#e8534a" />
        <path d="M22 43 Q32 49 42 43" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.9" />
      `
    default:
      return `<path d="M25 46 Q32 48 39 46" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" />`
  }
}

function tearsFor(level: MoodLevel): string {
  if (level !== 1) return ''
  return `
    <path d="M16 34 q-3.6 6.4 0 10 q3.6 -3.6 0 -10 Z" fill="#7ec8ff" stroke="${INK}" stroke-width="1.2" />
    <path d="M48 34 q-3.6 6.4 0 10 q3.6 -3.6 0 -10 Z" fill="#7ec8ff" stroke="${INK}" stroke-width="1.2" />
  `
}

function blushFor(level: MoodLevel): string {
  if (level === 1) return ''
  return `
    <ellipse cx="13.5" cy="42" rx="5.6" ry="3.2" fill="#ff9d9d" opacity="0.55" />
    <ellipse cx="50.5" cy="42" rx="5.6" ry="3.2" fill="#ff9d9d" opacity="0.55" />
  `
}

// Leafletのdiv Icon(生のHTML文字列)とReactコンポーネントの両方から
// 同じ見た目を使い回せるよう、マークアップ生成をReactに依存しない純関数にしている
export function moodFaceMarkup(level: MoodLevel, size = 32): string {
  const color = SCORE_COLOR[level]
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- 頭の後ろから覗く丸い耳(カートゥーン風のシルエット) -->
    <circle cx="12" cy="23" r="8.5" fill="${color}" stroke="${INK}" stroke-width="3" />
    <circle cx="52" cy="23" r="8.5" fill="${color}" stroke="${INK}" stroke-width="3" />
    <line x1="32" y1="11" x2="32" y2="4" stroke="${INK}" stroke-width="3" stroke-linecap="round" />
    <circle cx="32" cy="4" r="3.6" fill="#ffe680" stroke="${INK}" stroke-width="2" />
    <circle cx="32" cy="36" r="25" fill="${color}" stroke="${INK}" stroke-width="3" />
    <ellipse cx="21" cy="20" rx="9" ry="5.5" fill="#fff" opacity="0.28" transform="rotate(-24 21 20)" />
    ${blushFor(level)}
    ${browsFor(level)}
    ${eyesFor(level)}
    ${tearsFor(level)}
    ${mouthFor(level)}
  </svg>`
}

// 絵文字の代わりに使う、丸くデフォルメしたキャラクターの顔
export function MoodFace({
  level,
  size = 32,
  className,
}: {
  level: MoodLevel
  size?: number
  className?: string
}) {
  return (
    <span
      className={className ? `mood-face ${className}` : 'mood-face'}
      style={{ width: size, height: size }}
      // eslint-disable-next-line react/no-danger -- 固定パターンから生成した自前SVGのみを描画(外部/ユーザー入力なし)
      dangerouslySetInnerHTML={{ __html: moodFaceMarkup(level, size) }}
    />
  )
}
