import { defineConfig, type Plugin } from 'vite';

// Сборки для площадок (--mode yandex | vk | crazygames): без перенаправления на наш домен — игра живёт по адресу площадки
const portalHtml = (): Plugin => ({
  name: 'portal-html',
  transformIndexHtml(html) {
    return html.replace(/<script>\s*\/\/ Одна игра — один адрес[\s\S]*?<\/script>\s*/, '');
  },
});

const PORTALS = ['yandex', 'vk', 'crazygames'];

// base: './' — сборка открывается из любой папки и из бакета Object Storage
export default defineConfig(({ mode }) => ({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
  plugins: PORTALS.includes(mode) ? [portalHtml()] : [],
}));
