# Gain 보안 및 무료 운영 검토

2026-10-03 KST. WSL `/home/eykim/projects/Gain`만 변경했다. Windows 원본, 운영 DB, 공급자 설정은 변경하지 않았다. 초기 구현 게시를 부모가 완료했다. 현재 문서 정정은 위임된 커밋·푸시로 반영하며 운영 배포/SQL 적용은 하지 않는다.

## 실제 설정과 정정

부모가 실제 대시보드에서 Vercel Hobby, Supabase 조직 ‘은열’ Free 및 GitHub 비공개 저장소/Actions 비활성화를 확인했다. 공유 Supabase ref `jlxr…`의 프로젝트 이름은 **gain-music-club**이다. 이전 감사에서 이를 Iam9P 소유의 잘못된 Gain 프로젝트라고 단정한 것은 잘못이었다. 정확한 문제는 Iam9P도 같은 프로젝트를 사용하며 기존 `public.photos`는 Iam9P 테이블이고 Gain 테이블/RLS/Storage 연결은 준비되지 않았다는 것이다. 추가 유료 프로젝트를 만들지 않는다.

`.env.local`은 보존했고 값은 출력하지 않았다. `VITE_GAIN_EXPECTED_PROJECT_REF` 기본값이 빈 값이므로 해당 환경에 키가 있어도 **외부 클라이언트를 만들지 않는다**. 별도 기대 프로젝트, 정확한 HTTPS origin과 공개 키 역할을 만족할 때만 `gain` 스키마 익명 읽기 클라이언트를 만들 수 있다. publishable 키의 프로젝트 일치는 서버에서 판별해야 하며 브라우저 검사는 암호학적 검증을 대신하지 않는다. JWT anon 키는 role/ref를 확인한다.

인증 클라이언트 `supabase`는 코드에서 null이며 `requireWrites()`는 항상 거절한다. 환경 자기선언으로 로그인·업로드·쓰기를 켤 수 없다. 관리자 화면은 연결/권한/무료 요금제/저장량 검증 대기 안내를 표시한다. 실제 권한·할당량 적용과 수동 코드 검토 전에는 이 경계를 풀지 않는다. 무료 계정 상태 확인은 공급자 AI billing 확인과 별개다. Gain에는 AI/뉴스 수집 구현 자체가 없다.

## 변경과 한도

- Node 24.19.0 / engines 24.x / pnpm 11.19.0. 모든 직접 의존성은 설치·검증된 정확한 버전이며 ESLint 10, TypeScript/Vue ESLint, vue-tsc를 사용한다. `verify`는 보안 검사, lint, typecheck, test, build 순서다. build 내부에서 공통 flock을 획득하므로 verify 밖에서 같은 lock을 다시 잡지 않는다.
- Git·배포 제외 규칙에 env/로그/DB/백업/원본 루트 JPG/이전 산출물을 추가했다. 공개 홈페이지에 필요한 public/logo.jpg는 유지한다. 공통 security-check는 변경하지 않았다.
- CI는 공통 수동 workflow로 대체했고 자동 push/PR/schedule과 artifact 저장을 제거했다. Vercel Git 자동배포는 false다. Actions 자체는 부모가 원격에서 비활성화했다.
- 각 테이블 조회는 최대 1,000행/20페이지며 초과하면 명시적인 오류를 표시한다. 동일 조회 중복 요청은 합친다. 각 HTTP 응답 2MiB/10초 제한, 비정상·뒤로 가는 커서 거절. 이는 호출·메모리 상한이며 계정 전체 비용 hard cap이 아니다.
- 사진 입력 검사: JPEG/PNG/WebP, 개별 20MiB, 배치 10개/합계40MiB, caption300자, 이미지 2,400만 화소. 현재 업로드는 실제 호출 이전에 닫혀 있다. 이미지 dimension 검사 유틸은 향후 검증된 업로드를 열 때 decode 직후 적용해야 한다. 현재 기능 차단을 우회해 파일을 전송하는 경로는 없다.
- 연락처 HTTPS 링크는 인증정보/별도 포트를 거절하며 영상은 정확한 YouTube/Instagram 호스트만 허용한다. React/Vue 텍스트 이스케이프를 유지하고 raw HTML 삽입을 lint로 금지한다. 외부 사용자 URL을 서버가 가져오는 경로는 없다.
- Vercel 및 Vite preview는 CSP/nosniff/DENY/referrer/permissions headers를 공유한다. CSP는 스크립트 self, 프레임/object 차단, Supabase HTTPS 사진·읽기만 허용한다. Vue/Vuetify의 런타임 스타일 때문에 style-src unsafe-inline은 필요하다. Vite dev에만 HMR WebSocket·개발 모듈 inline 허용을 별도로 둔다.
- 기존 두 관리자 구현의 임시 이미지 정리 실패 시 추적을 보존하고 Vue 삭제에서 Storage 정리 실패를 표시한다. 로그인/쓰기 전체가 닫혀 있어 운영 호출은 없다.

## 검토용 스키마와 실제 로컬 DB 검증

`supabase/review/20261003_gain_isolated.sql`은 **운영 미적용** 검토안이다. 기존 SQL 이력은 보존했다. 새 `gain` 스키마와 `gain-public-media-v1` 버킷, 독립 RLS/관리자 테이블/Storage 정책/원자적 예약 카운터를 만든다. 기존 public 테이블이나 기존 이미지 버킷을 변환·복사하지 않는다. 이름 충돌은 안전하게 실패하며 수동 검토가 필요하다. 스키마 노출은 별도 Supabase 설정이고 Storage trigger 권한과 실제 원격 grant 검증을 먼저 해야 한다. 기존 Iam9P 정책이 permissive하게 다른 버킷 접근을 허용하는지도 확인해야 한다. SQL 파일의 존재는 원격 적용 증거가 아니다.

테스트는 임시 메모리 PGlite PostgreSQL에서만 실행한다. auth.uid/users 및 storage 테이블은 격리 fixture로 모사하며 RLS, anon/비관리자 거절, 관리자 쓰기, 125개/250MiB 초과 거절·롤백·삭제 후 회수, 본문 한도, public.photos 보존을 실제 SQL로 확인한다. 실제 Supabase Storage HTTP enforcement와 여러 DB connection의 동시 업로드 부하 테스트를 대신하지 않는다. 비용 전역 제한은 DB 조건부 예약에서 검증하며 프런트엔드 메모리 카운터로 보장한다고 주장하지 않는다.

## 검증 및 남은 일

`pnpm verify`, `pnpm audit --audit-level=high`, frozen install, desktop/mobile 브라우저·HTTP headers 결과는 집계 JSON에 기록한다. 보안 negative tests는 환경/키/URL/페이지/행/응답·파일 크기와 RLS/쿼터 경계를 포함한다. 운영 데이터 쓰기·AI 호출·수집·배포는 하지 않는다.

실제 원격 RLS/버킷 제한·할당량 migration 및 스키마 노출, MFA/signup/auth rate-limit, 공유 프로젝트의 전체 사용량·Storage 정책 격리를 검토해야 한다. 기존 기록에 남은 ‘운영 개선 미배포’는 여전히 유효하다. 올바른 Gain 읽기 연결을 수동 검토 후 설정하고 검증된 스키마가 준비되기 전에는 기본 fallback을 유지한다. 원격 권한·저장량 검증 없이 쓰기를 열지 않는다. 무료 요금제에서도 한도 초과는 기능 제한·중지를 허용하며 절대적인 안전/무료 보장은 하지 않는다.

브라우저 검증에서 외부 Google Fonts CSS import가 CSP와 충돌하는 것을 확인해 제거했다. 운영체제 기본 한글 폰트 fallback을 사용하며 기본 화면은 외부 요청 없이 렌더링한다.

최종 검증: frozen install 및 pnpm verify 전체 성공, Node negative tests 15개 + 격리 PostgreSQL RLS/쿼터 테스트 성공, 전체 의존성 audit 취약점 없음. Desktop1280×900 / mobile390×844 각 5경로 HTTP200, 가로 넘침 없음, 외부 요청·클라이언트 오류 없음, 관리자 로그인/쓰기 차단 확인. CSP 포함 보안 헤더 검증 완료. 빌드의 728.91kB 관리자 청크 경고는 남는다. 이 문단의 로컬 검증 당시에는 커밋·푸시 전이었고 이력은 비어 있었다. 이후 부모가 초기 코드를 게시했으며 Git 이력 검사는 게시 단계와 이번 문서 푸시 hook에서 다시 수행한다. 운영 배포는 하지 않았다.

부모 운영 메타데이터 조회 추가 근거: public의 broods/completions/fish/photos/profiles/records/schedules/tanks 8개 테이블은 RLS=true이며 관측된 정책은 authenticated + auth.uid() 소유자 비교였다. public.photos는 Iam9P read_own SELECT 정책이 확인됐다. gain 스키마 테이블은 존재하지 않아 검토 SQL 미적용이 실제 metadata로 확인됐다. 조회는 스키마/정책 metadata만 대상으로 했고 사용자 데이터 조회나 운영 SQL 변경은 없었다. Storage 정책 전체 검증은 별도 남는다.

## 상위 세션 최종 게시 검토

2026-10-03: 공식 릴리스 SHA-256을 검증한 Gitleaks 8.30.1로 Git에 스테이징된 파일의 분리된 사본과 기존 전체 이력을 추가 검사했으며 발견 항목은 없었다. 공통 검사기에 Groq, Supabase 관리 토큰과 Vercel 토큰 탐지를 보강했다. 파일 권한은 소스 644 / Git hooks 755로 정리하고 UTF-8 LF 기준의 diff 검사를 통과시켰다. 부모가 초기 게시 커밋 44a6cdedc3aeae42540878bdd33a5199d4b6585d를 main에 게시 완료했다고 확인했다. 후속 문서 커밋도 푸시 전에 verify와 이력 검사를 통과해야 한다. 비공개 GitHub 게시와 운영 배포·SQL 적용은 별도 상태다.

최종 공유 저장량 예산 정정: Gain 검토 SQL은 125개/250MiB 예약 한도다. Iam9P에도 부모가 동일한 125개/250MiB 한도를 적용할 예정이므로 공유 합계는 500MiB로 설계한다. 실제 현재 저장량·다른 버킷·전송량은 별도 확인해야 하며 이는 공급자 전체 비용 보장이 아니다. 기존 public용 SQL 이력의 과거 800MiB 수치는 수정하지 않고 새 격리 검토안에만 낮춘 한도를 적용했다. 검토 SQL 전체는 하나의 BEGIN/COMMIT이며 마지막 구문에서 의도적으로 실패시켜 gain 스키마·버킷·정책이 모두 롤백되고 public.photos가 보존되는지 격리 PostgreSQL로 검사한다. 운영 미적용 상태는 유지한다.

최종 한도 정정 후 pnpm verify(15개 Node 테스트+격리 SQL 실패 전체 롤백/RLS/125개·250MiB 경계/회수 테스트/빌드), pnpm audit --audit-level=high 통과. 기존 AGENTS·공통 scanner·LF 및 파일644/hooks755를 보존하고 관련 파일만 재스테이징했다.

## 현재 안내 문서 정정 (2026-10-03)

README 본문의 새 프로젝트·관리 계정 생성·public SQL 적용·로그인 편집·직접 배포 안내를 현재 절차에서 제거했다. 최초 실행은 연결 없는 fallback이다. 기대 프로젝트 설정은 익명 읽기 조건일 뿐 immutable 로그인/쓰기/업로드 차단을 해제하지 않는다. 운영 기록은 날짜가 있는 과거 증거로 보존하며 현재 절차와 분리했다. 이 문서 정정은 코드·SQL·운영 설정·.env.local 변경 없이 수행한다.
