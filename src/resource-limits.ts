export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export function validateImageInput(file: { type: string; size: number }): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > MAX_INPUT_BYTES)
    throw new Error('JPG, PNG, WebP 이미지를 20MB 이하로 선택해 주세요.');
}
export function validateImageDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > MAX_IMAGE_PIXELS)
    throw new Error('사진은 2,400만 화소 이하로 선택해 주세요.');
}
export function validateImageBatch(files: readonly { type: string; size: number; name: string }[]): void {
  if (!files.length || files.length > 10 || files.reduce((sum, f) => sum + f.size, 0) > 40 * 1024 * 1024)
    throw new Error('사진은 한 번에 10개, 합계 40MB까지 선택해 주세요.');
  for (const file of files) { validateImageInput(file); if (Array.from(file.name.replace(/\.[^.]+$/, '')).length > 300) throw new Error('사진 이름은 300자 이하로 입력해 주세요.'); }
}
export async function limitedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const deadline = AbortSignal.timeout(10_000);
  const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
  const response = await fetch(input, { ...init, signal });
  const max = 2 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new Error('응답 크기가 한도를 초과했습니다.'); }
  const reader = response.body?.getReader(); if (!reader) return response;
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > max) throw new Error('응답 크기가 한도를 초과했습니다.'); chunks.push(value); }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
}
