<script setup lang="ts">
import { validateImageBatch } from "../resource-limits";
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { contentError, settingsError } from '../validation';
import { emptyData, fetchData, imageUrl, supabase, uploadImage } from '../data';
import type { ContentRecord, RecordType, Settings, SiteData } from '../types';
import { categories, dateLabel, fromLocalInput, safeUrl, toLocalInput, videoUrl } from '../utils';

type Section = RecordType | 'settings' | 'dashboard';
const navItems: { key: Section; label: string; eyebrow: string }[] = [
  { key: 'dashboard', label: '대시보드', eyebrow: 'OVERVIEW' },
  { key: 'events', label: '일정', eyebrow: 'CALENDAR' },
  { key: 'performances', label: '공연', eyebrow: 'ON STAGE' },
  { key: 'notices', label: '공지', eyebrow: 'NOTICE' },
  { key: 'albums', label: '활동 기록', eyebrow: 'MOMENTS' },
  { key: 'settings', label: '소개·가입 안내', eyebrow: 'SETTINGS' },
];

const { mobile } = useDisplay();
const drawer = ref(!mobile.value);
const checking = ref(true);
const allowed = ref(false);
const signed = ref(false);
const busy = ref(false);
const email = ref('');
const password = ref('');
const error = ref('');
const message = ref('');
const section = ref<Section>('dashboard');
const data = ref<SiteData>(structuredClone(emptyData));
const settings = ref<Settings>(structuredClone(emptyData.settings));
const draft = ref<ContentRecord | null>(null);
const deleting = ref<ContentRecord | null>(null);
const search = ref('');
const pendingImages = new Set<string>();
let authSubscription: { unsubscribe: () => void } | undefined;

watch(mobile, value => { drawer.value = !value; });
const activeNav = computed(() => navItems.find(item => item.key === section.value) ?? navItems[0]);
const records = computed(() => {
  if (!['events', 'performances', 'notices', 'albums'].includes(section.value)) return [];
  const rows = [...data.value[section.value as RecordType]].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const query = search.value.trim().toLocaleLowerCase('ko');
  return query ? rows.filter(row => `${row.title} ${row.category} ${row.location}`.toLocaleLowerCase('ko').includes(query)) : rows;
});
const recent = computed(() => [...data.value.notices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4));
const savedDraft = computed(() => !!draft.value && section.value !== 'settings' && data.value[section.value as RecordType].some(row => row.id === draft.value?.id));
const photos = computed(() => !draft.value ? [] : data.value.photos.filter(photo => section.value === 'albums' ? photo.album_id === draft.value?.id : photo.performance_id === draft.value?.id));

function blankRecord(): ContentRecord {
  return { id: crypto.randomUUID(), title: '', body: '', category: '정모', starts_at: null, ends_at: null, location: '', pinned: false, cover_path: '', video_url: '', created_at: new Date().toISOString() };
}
function sectionCount(type: RecordType) { return data.value[type].length; }
function shortDate(value: string | null) { return value ? dateLabel(value, false) : '일정 미정'; }
async function reloadData() {
  data.value = await fetchData();
  settings.value = structuredClone(data.value.settings);
}
async function checkAccess() {
  if (!supabase) { checking.value = false; return; }
  const session = await supabase.auth.getSession();
  signed.value = !!session.data.session;
  if (session.data.session) {
    const result = await supabase.rpc('is_gain_admin');
    allowed.value = result.data === true;
    if (allowed.value) await reloadData();
  } else allowed.value = false;
  checking.value = false;
}
async function login() {
  if (!supabase) return;
  busy.value = true;
  error.value = '';
  const result = await supabase.auth.signInWithPassword({ email: email.value, password: password.value });
  if (result.error) error.value = '이메일과 비밀번호를 확인해 주세요.';
  else password.value = '';
  busy.value = false;
}
async function logout() {
  if (!supabase) return;
  busy.value = true;
  const result = await supabase.auth.signOut();
  if (result.error) error.value = '로그아웃하지 못했습니다. 다시 시도해 주세요.';
  await discardImages();
  draft.value = null;
  allowed.value = false;
  signed.value = false;
  busy.value = false;
}
async function discardImages() {
  const paths = [...pendingImages];
  if (paths.length && supabase) {
    const result = await supabase.storage.from('gain-public-media-v1').remove(paths);
    if (result.error) throw new Error('임시 사진 정리에 실패했습니다. 저장 공간을 확인해 주세요.');
    for (const path of paths) pendingImages.delete(path);
  }
}
async function selectSection(value: Section) {
  if (draft.value && !window.confirm('저장하지 않은 내용을 닫을까요?')) return;
  await discardImages();
  section.value = value;
  draft.value = null;
  deleting.value = null;
  search.value = '';
  message.value = '';
  error.value = '';
  if (mobile.value) drawer.value = false;
}
function createRecord() {
  const record = blankRecord();
  if (section.value === 'performances') record.category = '소공연';
  draft.value = record;
  message.value = '';
}
function editRecord(record: ContentRecord) {
  draft.value = { ...record };
  message.value = '';
}
async function openNew(type: RecordType) {
  await selectSection(type);
  createRecord();
}
async function openEdit(type: RecordType, record: ContentRecord) {
  await selectSection(type);
  editRecord(record);
}
async function closeEditor() {
  if (draft.value && !window.confirm('작성 중인 내용을 닫을까요?')) return;
  await discardImages();
  draft.value = null;
}
async function saveRecord() {
  if (!supabase || !draft.value || !['events', 'performances', 'notices', 'albums'].includes(section.value)) return;
  error.value = '';
  message.value = '';
  const validation = contentError(draft.value); if (validation) { error.value = validation; return; }
  if (!draft.value.title.trim()) { error.value = '제목을 입력해 주세요.'; return; }
  if (section.value === 'events' && !draft.value.starts_at) { error.value = '일정의 시작 일시를 입력해 주세요.'; return; }
  if (draft.value.ends_at && (!draft.value.starts_at || draft.value.ends_at < draft.value.starts_at)) { error.value = '종료 시간은 시작 시간 이후여야 합니다.'; return; }
  if (draft.value.video_url && !videoUrl(draft.value.video_url)) { error.value = '유튜브 또는 인스타그램의 HTTPS 영상 주소를 입력해 주세요.'; return; }
  busy.value = true;
  try {
    const type = section.value as RecordType;
    const result = await supabase.from(type).upsert({ ...draft.value, title: draft.value.title.trim() });
    if (result.error) throw result.error;
    pendingImages.delete(draft.value.cover_path);
    const previous = data.value[type].find(item => item.id === draft.value?.id)?.cover_path;
    if (previous && previous !== draft.value.cover_path) await supabase.storage.from('gain-public-media-v1').remove([previous]);
    await discardImages();
    await reloadData();
    message.value = '저장했습니다. 공개 페이지에 반영됩니다.';
    draft.value = null;
  } catch { error.value = '저장하지 못했습니다. 연결 상태와 운영자 권한을 확인해 주세요.'; }
  finally { busy.value = false; }
}
async function saveSettings() {
  if (!supabase) return;
  error.value = '';
  message.value = '';
  const validation = settingsError(settings.value); if (validation) { error.value = validation; return; }
  if ((settings.value.contact_url && !safeUrl(settings.value.contact_url)) || (settings.value.instagram_url && !safeUrl(settings.value.instagram_url))) { error.value = '문의처와 인스타그램은 HTTPS 주소를 입력해 주세요.'; return; }
  if (settings.value.faqs.some(item => !item.question.trim() || !item.answer.trim())) { error.value = '질문과 답변을 모두 채우거나 빈 항목을 삭제해 주세요.'; return; }
  busy.value = true;
  const result = await supabase.from('site_settings').upsert(settings.value);
  if (result.error) error.value = '안내를 저장하지 못했습니다. 다시 시도해 주세요.';
  else { await reloadData(); message.value = '소개와 가입 안내를 저장했습니다.'; }
  busy.value = false;
}
async function removeRecord() {
  if (!supabase || !deleting.value || !['events', 'performances', 'notices', 'albums'].includes(section.value)) return;
  busy.value = true;
  error.value = '';
  try {
    const type = section.value as RecordType;
    const related = data.value.photos.filter(photo => type === 'albums' ? photo.album_id === deleting.value?.id : type === 'performances' ? photo.performance_id === deleting.value?.id : false);
    const paths = [deleting.value.cover_path, ...related.map(photo => photo.path)].filter(Boolean);
    const result = await supabase.from(type).delete().eq('id', deleting.value.id);
    if (result.error) throw result.error;
    if (paths.length) { const cleanup = await supabase.storage.from('gain-public-media-v1').remove(paths); if (cleanup.error) throw new Error('게시물은 삭제했지만 사진 정리에 실패했습니다.'); }
    deleting.value = null;
    await reloadData();
    message.value = '삭제했습니다.';
  } catch { error.value = '삭제 또는 사진 정리를 완료하지 못했습니다. 저장소를 확인해 주세요.'; }
  finally { busy.value = false; }
}
async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !draft.value) return;
  busy.value = true;
  error.value = '';
  try {
    const path = await uploadImage(file);
    pendingImages.add(path);
    const old = draft.value.cover_path;
    draft.value.cover_path = path;
    if (old && !data.value[section.value as RecordType].some(row => row.cover_path === old)) await supabase?.storage.from('gain-public-media-v1').remove([old]);
  } catch (reason) { error.value = (reason as Error).message; }
  finally { busy.value = false; }
}
async function addPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!supabase || !draft.value || !files.length) return;
  busy.value = true;
  error.value = '';
  try {
    if (!savedDraft.value) throw new Error('사진을 추가하려면 게시물을 먼저 저장한 다음 다시 수정해 주세요.');
    validateImageBatch(files);
    for (const file of files) {
      const path = await uploadImage(file);
      const result = await supabase.from('photos').insert({ [section.value === 'albums' ? 'album_id' : 'performance_id']: draft.value.id, path, caption: file.name.replace(/\.[^.]+$/, '') });
      if (result.error) { await supabase.storage.from('gain-public-media-v1').remove([path]); throw new Error('사진 정보를 저장하지 못했습니다.'); }
    }
    await reloadData();
    message.value = '사진을 추가했습니다.';
  } catch (reason) { error.value = (reason as Error).message; }
  finally { busy.value = false; }
}
async function removePhoto(id: string, path: string) {
  if (!supabase || !window.confirm('이 사진을 삭제할까요?')) return;
  busy.value = true;
  const result = await supabase.from('photos').delete().eq('id', id);
  if (!result.error) { const cleanup = await supabase.storage.from('gain-public-media-v1').remove([path]); if (cleanup.error) error.value = '사진 목록은 삭제했지만 저장소 정리에 실패했습니다.'; }
  else error.value = '사진을 삭제하지 못했습니다.';
  await reloadData();
  busy.value = false;
}

onMounted(async () => {
  await checkAccess();
  if (supabase) {
    const listener = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => { void checkAccess(); }, 0); });
    authSubscription = listener.data.subscription;
  }
});
onBeforeUnmount(() => { authSubscription?.unsubscribe(); void discardImages(); });
</script>

<template>
  <v-app class="gain-admin-app">
    <div v-if="!supabase" class="auth-shell">
      <section class="auth-story">
        <a class="admin-brand" href="/"><span class="brand-mark">가인</span><span>GA;IN ADMIN</span></a>
        <div>
          <span class="overline">CONTENT STUDIO</span>
          <h1>가인의 이야기를<br>한곳에서 관리하세요.</h1>
          <p>일정, 공연, 공지와 활동 사진을 운영진이 직접 기록하는 관리 공간입니다.</p>
        </div>
        <p class="auth-foot">음악으로 이어지는 우리 · GA;IN</p>
      </section>
      <main class="auth-panel">
        <v-card class="auth-card" border>
          <v-chip color="warning" variant="tonal" size="small">서비스 연결 대기</v-chip>
          <h2>운영자 페이지 준비 중</h2>
          <p>화면 구성이 완료되었습니다. Gain 전용 연결, 실제 권한·무료 요금제·저장량 제한 검증이 완료될 때까지 로그인과 저장을 사용할 수 없습니다.</p>
          <div class="connection-steps">
            <div><strong>01</strong><span>무료 Supabase 프로젝트 연결</span></div>
            <div><strong>02</strong><span>운영자 계정과 권한 등록</span></div>
            <div><strong>03</strong><span>게시글·사진 관리 시작</span></div>
          </div>
          <v-btn color="primary" variant="flat" size="large" block href="/">공개 홈페이지로 돌아가기</v-btn>
        </v-card>
      </main>
    </div>

    <div v-else-if="checking" class="loading-shell">
      <v-progress-circular color="primary" indeterminate size="48" />
      <p>운영자 권한을 확인하고 있습니다.</p>
    </div>

    <div v-else-if="!allowed" class="auth-shell">
      <section class="auth-story">
        <a class="admin-brand" href="/"><span class="brand-mark">가인</span><span>GA;IN ADMIN</span></a>
        <div>
          <span class="overline">WELCOME BACK</span>
          <h1>오늘의 소식도<br>차분히 기록해요.</h1>
          <p>사전 등록된 가인 운영진만 접속할 수 있습니다.</p>
        </div>
        <p class="auth-foot">음악으로 이어지는 우리 · GA;IN</p>
      </section>
      <main class="auth-panel">
        <v-card class="auth-card" border>
          <v-chip color="primary" variant="tonal" size="small">OPERATOR ONLY</v-chip>
          <h2>운영자 로그인</h2>
          <template v-if="signed">
            <v-alert color="warning" variant="tonal" title="운영자 권한이 없습니다" text="등록된 운영자 계정으로 다시 로그인해 주세요." />
            <v-btn variant="outlined" size="large" block @click="logout">다른 계정으로 로그인</v-btn>
          </template>
          <v-form v-else class="login-form" @submit.prevent="login">
            <v-text-field v-model="email" label="이메일" type="email" autocomplete="username" required />
            <v-text-field v-model="password" label="비밀번호" type="password" autocomplete="current-password" required />
            <v-alert v-if="error" color="error" variant="tonal" density="compact">{{ error }}</v-alert>
            <v-btn color="primary" variant="flat" size="large" block type="submit" :loading="busy">로그인</v-btn>
            <small>계정은 공개 회원가입 없이 운영진이 사전 등록합니다.</small>
          </v-form>
          <a class="back-link" href="/">← 공개 홈페이지로 돌아가기</a>
        </v-card>
      </main>
    </div>

    <v-layout v-else class="admin-layout">
      <v-navigation-drawer v-model="drawer" :permanent="!mobile" :temporary="mobile" width="276" class="admin-drawer">
        <div class="drawer-brand"><span class="drawer-logo">가인</span><div><strong>GA;IN</strong><small>CONTENT STUDIO</small></div></div>
        <v-list nav class="drawer-nav">
          <v-list-item v-for="item in navItems" :key="item.key" :active="section === item.key" color="primary" rounded="lg" @click="selectSection(item.key)">
            <template #prepend><span class="nav-index">{{ String(navItems.indexOf(item) + 1).padStart(2, '0') }}</span></template>
            <v-list-item-title>{{ item.label }}</v-list-item-title>
          </v-list-item>
        </v-list>
        <div class="drawer-bottom"><span class="status-dot" />서비스 연결됨<a href="/">홈페이지 보기 ↗</a></div>
      </v-navigation-drawer>

      <v-main>
        <v-app-bar flat class="admin-topbar">
          <v-btn v-if="mobile" variant="text" aria-label="메뉴 열기" @click="drawer = true">☰</v-btn>
          <v-app-bar-title><small>{{ activeNav.eyebrow }}</small><strong>{{ activeNav.label }}</strong></v-app-bar-title>
          <v-btn variant="outlined" class="logout-button" :loading="busy" @click="logout">로그아웃</v-btn>
        </v-app-bar>

        <div class="admin-content">
          <v-alert v-if="error" color="error" variant="tonal" closable class="mb-5" @click:close="error = ''">{{ error }}</v-alert>
          <v-alert v-if="message" color="success" variant="tonal" closable class="mb-5" @click:close="message = ''">{{ message }}</v-alert>

          <template v-if="section === 'dashboard'">
            <header class="content-heading"><div><span class="overline">GA;IN OVERVIEW</span><h1>가인의 오늘을 관리해요.</h1><p>등록된 콘텐츠와 운영 상태를 한눈에 확인할 수 있습니다.</p></div><v-btn color="primary" variant="flat" size="large" @click="openNew('notices')">새 공지 작성</v-btn></header>
            <v-row class="metric-grid">
              <v-col v-for="card in [{key:'events',label:'일정',value:sectionCount('events')},{key:'performances',label:'공연',value:sectionCount('performances')},{key:'notices',label:'공지',value:sectionCount('notices')},{key:'albums',label:'활동 기록',value:sectionCount('albums')} ]" :key="card.key" cols="6" md="3">
                <v-card class="metric-card" border @click="selectSection(card.key as Section)"><span>{{ card.label }}</span><strong>{{ card.value }}</strong><small>게시물 관리 →</small></v-card>
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12" lg="8"><v-card class="panel-card" border><div class="panel-head"><div><span class="overline">RECENT NOTICE</span><h2>최근 공지</h2></div><v-btn variant="text" color="primary" @click="selectSection('notices')">전체 보기</v-btn></div><div v-if="recent.length" class="recent-list"><button v-for="notice in recent" :key="notice.id" @click="openEdit('notices', notice)"><span>{{ notice.pinned ? '중요' : '공지' }}</span><strong>{{ notice.title }}</strong><time>{{ shortDate(notice.created_at) }}</time></button></div><div v-else class="empty-state">등록된 공지가 없습니다.</div></v-card></v-col>
              <v-col cols="12" lg="4"><v-card class="panel-card system-card" border><span class="overline">SYSTEM</span><h2>운영 상태</h2><dl><div><dt>데이터베이스</dt><dd><span class="status-dot" />연결됨</dd></div><div><dt>사진 업로드</dt><dd>WebP · 최대 2MB</dd></div><div><dt>영상</dt><dd>외부 링크 방식</dd></div><div><dt>공개 사이트</dt><dd><a href="/">바로가기 ↗</a></dd></div></dl></v-card></v-col>
            </v-row>
          </template>

          <template v-else-if="section === 'settings'">
            <header class="content-heading compact"><div><span class="overline">SITE SETTINGS</span><h1>소개와 가입 안내</h1><p>공개 홈페이지에 표시되는 기본 정보를 관리합니다.</p></div></header>
            <v-form @submit.prevent="saveSettings"><v-card class="editor-card" border><h2>가인 소개</h2><v-textarea v-model="settings.about" label="가인 소개" rows="5" /><v-textarea v-model="settings.trainer" label="보컬트레이너 소개" rows="5" /><v-textarea v-model="settings.join_info" label="가입 안내" rows="5" /><v-row><v-col cols="12" md="6"><v-text-field v-model="settings.contact_url" label="가입 문의 주소" placeholder="https://" /></v-col><v-col cols="12" md="6"><v-text-field v-model="settings.instagram_url" label="공식 인스타그램 주소" placeholder="https://" /></v-col></v-row><div class="editor-section-head"><h2>자주 묻는 질문</h2><v-btn variant="outlined" @click="settings.faqs.push({question:'', answer:''})">질문 추가</v-btn></div><v-card v-for="(faq, index) in settings.faqs" :key="index" class="faq-card" variant="tonal"><v-text-field v-model="faq.question" :label="`질문 ${index + 1}`" /><v-textarea v-model="faq.answer" label="답변" rows="3" /><v-btn color="error" variant="text" @click="settings.faqs.splice(index, 1)">질문 삭제</v-btn></v-card><div class="editor-footer"><v-btn color="primary" size="large" type="submit" :loading="busy">안내 저장</v-btn></div></v-card></v-form>
          </template>

          <template v-else-if="draft">
            <header class="content-heading compact"><div><button class="plain-back" @click="closeEditor">← {{ activeNav.label }} 목록</button><span class="overline">CONTENT EDITOR</span><h1>{{ savedDraft ? '게시물 수정' : '새 게시물 등록' }}</h1></div></header>
            <v-form @submit.prevent="saveRecord"><v-card class="editor-card" border><v-text-field v-model="draft.title" label="제목" maxlength="150" required /><v-select v-if="section !== 'notices'" v-model="draft.category" label="분류" :items="section === 'performances' ? ['소공연','대공연'] : categories" />
              <v-row v-if="section === 'events' || section === 'performances'"><v-col cols="12" md="6"><v-text-field label="시작 일시 (한국 시간)" type="datetime-local" :model-value="toLocalInput(draft.starts_at)" @update:model-value="draft!.starts_at = fromLocalInput(String($event))" /></v-col><v-col cols="12" md="6"><v-text-field label="종료 일시 (선택)" type="datetime-local" :model-value="toLocalInput(draft.ends_at)" @update:model-value="draft!.ends_at = fromLocalInput(String($event))" /></v-col></v-row>
              <v-text-field v-if="section === 'events' || section === 'performances'" v-model="draft.location" label="장소" /><v-textarea v-model="draft.body" label="내용" rows="10" /><v-checkbox v-if="section === 'notices'" v-model="draft.pinned" color="primary" label="중요 공지로 고정" /><v-text-field v-model="draft.video_url" label="영상 주소" hint="유튜브 또는 인스타그램 HTTPS 주소" persistent-hint />
              <div class="media-box"><div><span class="overline">COVER IMAGE</span><h2>대표 이미지·포스터</h2><p>업로드 전에 WebP로 자동 압축합니다.</p></div><v-btn tag="label" variant="outlined" :loading="busy">이미지 선택<input class="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" @change="uploadCover"></v-btn></div><img v-if="draft.cover_path" class="cover-preview" :src="imageUrl(draft.cover_path)" :alt="draft.title || '대표 이미지'">
              <template v-if="section === 'albums' || section === 'performances'"><div class="media-box"><div><span class="overline">PHOTO ALBUM</span><h2>사진 추가</h2><p>{{ savedDraft ? '여러 장을 한 번에 선택할 수 있습니다.' : '게시물을 먼저 저장한 뒤 사진을 추가할 수 있습니다.' }}</p></div><v-btn tag="label" variant="outlined" :disabled="!savedDraft" :loading="busy">사진 선택<input class="hidden-input" type="file" multiple accept="image/jpeg,image/png,image/webp" @change="addPhotos"></v-btn></div><div v-if="photos.length" class="photo-grid"><div v-for="photo in photos" :key="photo.id"><img :src="imageUrl(photo.path)" :alt="photo.caption"><v-btn color="error" variant="text" size="small" @click="removePhoto(photo.id, photo.path)">삭제</v-btn></div></div></template>
              <v-alert color="info" variant="tonal" density="compact">저장한 내용과 사진은 공개됩니다. 영상 파일은 업로드하지 않고 링크만 등록합니다.</v-alert><div class="editor-footer"><v-btn color="primary" size="large" type="submit" :loading="busy">저장하기</v-btn><v-btn size="large" variant="outlined" @click="closeEditor">닫기</v-btn></div></v-card></v-form>
          </template>

          <template v-else>
            <header class="content-heading"><div><span class="overline">{{ activeNav.eyebrow }}</span><h1>{{ activeNav.label }} 관리</h1><p>등록된 내용을 확인하고 새로운 소식을 작성합니다.</p></div><v-btn color="primary" size="large" @click="createRecord">새로 등록</v-btn></header>
            <v-card class="list-card" border><div class="list-toolbar"><v-text-field v-model="search" label="제목·분류·장소 검색" hide-details clearable class="search-field" /><span>전체 {{ records.length }}건</span></div><v-table class="content-table"><thead><tr><th>제목</th><th>분류</th><th>등록일</th><th class="actions-cell">관리</th></tr></thead><tbody><tr v-for="record in records" :key="record.id"><td><strong>{{ record.title }}</strong><small v-if="record.location">{{ record.location }}</small></td><td><v-chip size="small" variant="tonal" color="primary">{{ record.category }}</v-chip></td><td>{{ shortDate(record.created_at) }}</td><td class="actions-cell"><v-btn variant="text" size="small" @click="editRecord(record)">수정</v-btn><v-btn color="error" variant="text" size="small" @click="deleting = record">삭제</v-btn></td></tr><tr v-if="!records.length"><td colspan="4"><div class="empty-state">등록된 내용이 없습니다. 첫 소식을 전해 주세요.</div></td></tr></tbody></v-table></v-card>
          </template>
        </div>
      </v-main>

      <v-dialog :model-value="!!deleting" max-width="520" @update:model-value="value => { if (!value) deleting = null }"><v-card class="delete-card"><span class="overline">DELETE CONTENT</span><h2>게시물을 삭제할까요?</h2><p>‘{{ deleting?.title }}’과 연결된 사진도 함께 삭제됩니다. 삭제한 내용은 복구할 수 없습니다.</p><div><v-btn variant="outlined" @click="deleting = null">취소</v-btn><v-btn color="error" :loading="busy" @click="removeRecord">삭제</v-btn></div></v-card></v-dialog>
    </v-layout>
  </v-app>
</template>
