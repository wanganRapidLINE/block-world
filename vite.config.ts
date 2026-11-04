import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => ({
  // GitHub Pages などサブフォルダに置いても動くよう相対パスにする
  base: './',
  plugins: [
    // `npm run dev:lan` のときだけ自己署名証明書のHTTPSでLANに公開する（スマホでの確認用）
    ...(mode === 'lan' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 外でも遊べるよう、BGM の mp3 も含めて最初に開いたとき丸ごと保存する
        globPatterns: ['**/*.{js,css,html,svg,png,ico,mp3}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Block World',
        short_name: 'Block World',
        description: 'ワールドルール準拠の落ちものパズル（SRS・HOLD・T-Spin対応）',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#0b0c1c',
        theme_color: '#0b0c1c',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: mode === 'lan' ? { host: true } : undefined,
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
