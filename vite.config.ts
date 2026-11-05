import { defineConfig, type Plugin } from 'vite';

// Сборка для Яндекс Игр (--mode yandex): без перенаправления на наш домен — игра живёт по адресу площадки
const yandexHtml = (): Plugin => ({
  name: 'yandex-html',
  transformIndexHtml(html) {
    return html.replace(/<script>\s*\/\/ Одна игра — один адрес[\s\S]*?<\/script>\s*/, '');
  },
});

// base: './' — сборка открывается из любой папки и из бакета Object Storage
export default defineConfig(({ mode }) => ({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
  plugins: mode === 'yandex' ? [yandexHtml()] : [],
}));
