import { Link } from 'react-router-dom';
import type { ContentRecord } from './types';
import { koreanDay } from './utils';

export default function NoticeBoard({ records }: { records: ContentRecord[] }) {
  const chronological = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const numbers = new Map(chronological.map((record, index) => [record.id, index + 1]));
  return <div className="notice-board">
    <p className="board-count">전체 <strong>{records.length}</strong>건</p>
    <table>
      <caption className="sr-only">가인 공지사항 게시판</caption>
      <colgroup><col className="board-number-col"/><col/><col className="board-date-col"/></colgroup>
      <thead><tr><th scope="col">번호</th><th scope="col">제목</th><th scope="col">등록일</th></tr></thead>
      <tbody>{records.length ? records.map(record => <tr key={record.id} className={record.pinned ? 'pinned-row' : undefined}>
        <td>{numbers.get(record.id)}</td>
        <td><Link to={`/notices/${record.id}`}>{record.pinned && <span className="board-pin">공지</span>}<span>{record.title}</span></Link></td>
        <td><time dateTime={record.created_at}>{koreanDay(record.created_at).replaceAll('-', '.')}</time></td>
      </tr>) : <tr><td colSpan={3} className="board-empty">아직 등록된 공지가 없습니다.</td></tr>}</tbody>
    </table>
  </div>;
}
