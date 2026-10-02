export type BackendConfig = { url?: string; key?: string; expectedProject?: string };
export function publicBackend(config: BackendConfig): { url: string; key: string } | null {
  // No operator-provided "confirmed" flag can unlock writes or authentication.
  if (!config.expectedProject || !/^[a-z0-9]{20}$/.test(config.expectedProject)) return null;
  try {
    const url = new URL(config.url || '');
    if (url.protocol !== 'https:' || url.hostname !== `${config.expectedProject}.supabase.co`
      || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const key = config.key || '';
    if (key.startsWith('sb_publishable_') && /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return { url: url.origin, key };
    const pieces = key.split('.');
    if (pieces.length !== 3) return null;
    const payload = JSON.parse(atob(pieces[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'anon' || payload.ref !== config.expectedProject) return null;
    return { url: url.origin, key };
  } catch { return null; }
}
export const WRITES_ENABLED = false;
export function requireWrites(): never { throw new Error('권한·무료 요금제·저장량 제한 검증 전에는 로그인과 저장을 사용할 수 없습니다.'); }
