import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import config from './vercel.json';
const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
export default defineConfig({ plugins: [react(), vue()], server: { host: '127.0.0.1', headers: { ...headers, 'Content-Security-Policy': headers['Content-Security-Policy'].replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:*") } }, preview: { host: '127.0.0.1', headers } });
