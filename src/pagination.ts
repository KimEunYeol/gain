export async function allPages<T extends { id: string | number }>(
  fetchPage: (after?: string | number) => Promise<{ data: T[] | null; error: unknown }>,
  limits = { maxRows: 1000, maxPages: 20 },
): Promise<T[]> {
  if (!Number.isInteger(limits.maxRows) || limits.maxRows < 1 || limits.maxRows > 5000 || !Number.isInteger(limits.maxPages) || limits.maxPages < 1 || limits.maxPages > 100) throw new Error('조회 제한을 확인해 주세요.');
  const rows: T[] = []; let after: string | number | undefined;
  for (let page = 0; page < limits.maxPages; page++) {
    const result = await fetchPage(after);
    if (result.error || !Array.isArray(result.data)) throw new Error('소식을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    if (!result.data.length) return rows;
    if (rows.length + result.data.length > limits.maxRows) throw new Error('조회 한도를 초과했습니다. 기간별 조회가 필요합니다.');
    for (const row of result.data) {
      if (!row || !['string', 'number'].includes(typeof row.id) || (typeof row.id === 'number' && !Number.isFinite(row.id)) || (after !== undefined && (typeof row.id !== typeof after || row.id <= after))) throw new Error('조회 순서를 확인하지 못했습니다.');
      after = row.id;
    }
    rows.push(...result.data);
  }
  throw new Error('조회 페이지 한도를 초과했습니다. 기간별 조회가 필요합니다.');
}
