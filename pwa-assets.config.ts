import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// アイコンは透明部分を作らない（Android の Firefox などで白く抜けるのを防ぐ）。
// icon.svg は背景が正方形で塗りつぶされているので、余白なしでそのまま使う。
// ブロックの絵は中心から半径 40% の円に収まっており、maskable の安全領域の条件も満たす。
const background = '#0b0c1c';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
