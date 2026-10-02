import type { ContentRecord, Settings } from './types.ts';
const length = (value: string) => Array.from(value).length;
export function contentError(value: ContentRecord): string {
  if (!value.title.trim() || length(value.title) > 150) return '제목은 1~150자로 입력해 주세요.';
  if (length(value.body) > 20000) return '본문은 20,000자 이하로 입력해 주세요.';
  if (length(value.location) > 300) return '장소는 300자 이하로 입력해 주세요.';
  if (length(value.cover_path) > 512 || length(value.video_url) > 2048) return '사진 경로나 영상 주소가 너무 깁니다.';
  return '';
}
export function settingsError(value: Settings): string {
  if ([value.about, value.trainer, value.join_info].some(text => length(text) > 10000)) return '소개와 가입 안내는 각각 10,000자 이하로 입력해 주세요.';
  if ([value.contact_url, value.instagram_url].some(text => length(text) > 2048)) return '주소는 2,048자 이하로 입력해 주세요.';
  if (value.faqs.length > 30) return '자주 묻는 질문은 30개까지 등록할 수 있습니다.';
  if (value.faqs.some(faq => !faq.question.trim() || !faq.answer.trim() || length(faq.question) > 300 || length(faq.answer) > 3000))
    return 'FAQ 질문은 1~300자, 답변은 1~3,000자로 입력해 주세요.';
  return '';
}
