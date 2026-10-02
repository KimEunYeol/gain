export type Category = '정모' | '보컬 연습' | '소공연' | '대공연';
export type RecordType = 'events' | 'performances' | 'notices' | 'albums';
export interface ContentRecord { id: string; title: string; body: string; category: Category; starts_at: string | null; ends_at: string | null; location: string; pinned: boolean; cover_path: string; video_url: string; created_at: string; }
export interface Photo { id: string; album_id: string | null; performance_id: string | null; path: string; caption: string; created_at: string; }
export interface Settings { id: number; about: string; trainer: string; join_info: string; contact_url: string; instagram_url: string; faqs: { question: string; answer: string }[]; }
export interface SiteData { settings: Settings; events: ContentRecord[]; performances: ContentRecord[]; notices: ContentRecord[]; albums: ContentRecord[]; photos: Photo[]; }
