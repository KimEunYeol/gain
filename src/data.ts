import { publicBackend, requireWrites } from './backend-policy';
import { limitedFetch, validateImageInput } from './resource-limits';
import { allPages } from './pagination';
import { welcomeNotice } from './content/welcome-notice';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SiteData, Settings } from './types';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const backend = publicBackend({ url, key, expectedProject: import.meta.env.VITE_GAIN_EXPECTED_PROJECT_REF });
export const GAIN_SCHEMA = 'gain';
export const GAIN_MEDIA_BUCKET = 'gain-public-media-v1';
const readClient = backend ? createClient(backend.url, backend.key, { db: { schema: GAIN_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: limitedFetch } }) : null;
// No authenticated client is exposed until remote authority/quota/billing is verified.
export const supabase: SupabaseClient | null = null;
export const defaults: Settings = { id: 1, about: '가인은 음악을 사랑하는 사람들이 만든 동호회입니다. 전문 보컬트레이너와 함께 노래를 배우고, 소공연과 대공연을 통해 우리의 음악을 나눕니다.', trainer: '', join_info: '음악을 사랑하는 마음으로, 가인과 함께해요. 자세한 가입 안내는 곧 전해드리겠습니다.', contact_url: '', instagram_url: '', faqs: [] };
export const emptyData: SiteData = { settings: defaults, events: [], performances: [], notices: [welcomeNotice], albums: [], photos: [] };
export function imageUrl(path: string): string { return /^[a-zA-Z0-9_-]{1,100}\.webp$/.test(path) && readClient ? readClient.storage.from(GAIN_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl : ''; }
async function loadData(): Promise<SiteData> { if (!readClient) return emptyData; const tables = ['site_settings', 'events', 'performances', 'notices', 'albums', 'photos'] as const; const results = await Promise.all(tables.map(t => allPages(async after => { let query = readClient!.from(t).select('*').order('id').limit(200); if (after !== undefined) query = query.gt('id', after); return query; })));  return { settings: results[0]?.[0] || defaults, events: results[1] || [], performances: results[2] || [], notices: results[3] || [], albums: results[4] || [], photos: results[5] || [] }; }
export async function uploadImage(file: File): Promise<string> {
  validateImageInput(file);
  return requireWrites();
}

let inFlight: Promise<SiteData> | undefined;
export function fetchData(): Promise<SiteData> {
  if (!inFlight) inFlight = loadData().finally(() => { inFlight = undefined; });
  return inFlight;
}
