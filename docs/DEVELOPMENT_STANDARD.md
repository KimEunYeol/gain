# 웹앱 공통 개발 표준

이 표준은 Iam9P, BusyBusyNowSociety, 하루열, Gain의 WSL 개발, Git 형상관리, 보안, 무료 운영에 적용한다. 버전은 1.0이며 기준일은 2026년 10월 3일이다. 앱의 기존 기능과 프레임워크는 유지하고 실행 도구, 검증 명령, 보안 경계와 비용 정책을 통일한다.

## 개발 환경과 의존성

소스는 WSL Ubuntu의 `/home/eykim/projects`에서 관리한다. Node.js 24.19.0과 pnpm 11.19.0을 사용한다. `package.json`에 `engines.node`와 `packageManager`를 선언하고 모든 직접 의존성을 검증된 정확한 버전으로 고정한다. 잠금파일은 커밋하고 `pnpm install --frozen-lockfile`로 설치한다. 기존 잠금파일을 이유 없이 재생성하거나 검증되지 않은 `latest`로 교체하지 않는다.

UTF-8, LF, 두 칸 들여쓰기를 사용한다. 앱 진입점, 데이터 접근과 외부 서비스 호출은 분리하고 TypeScript의 strict 검사를 유지한다. 기존 Next.js 또는 Vite 구조와 화면 기능은 보존한다. 공통 검사 인터페이스는 `lint`, `typecheck`, `test`, `build`, `security:check`, `security:history`, `verify`이다. 린트는 실제 소스 분석 도구로 구현하고 형식적인 성공 명령으로 대체하지 않는다.

## Git 형상관리와 비밀값

각 앱은 `KimEunYeol/Iam9P`, `KimEunYeol/BusyBusyNowSociety`, `KimEunYeol/haruyeol`, `KimEunYeol/Gain`의 독립 비공개 저장소로 관리한다. 기존 Git 이력과 사용자 변경은 보존한다. 정상 검증된 코드만 커밋한다. 운영 앱에 연결된 저장소의 변경은 검토 브랜치에서 먼저 제공하며 자동 배포를 차단한다.

`.env.local`, 토큰, 개인키, DB 파일, 업로드 원본, 로그, 캐시, 배포 인증 정보, 이전 작업 산출물은 커밋하지 않는다. `.env.example`에는 빈 값 또는 명백한 예시만 넣는다. public Supabase 키는 관리자 비밀키와 구분해야 하며 `service_role`, `sb_secret_` 또는 다른 관리자 키를 브라우저 환경변수에 넣지 않는다. 비밀값 검사 결과에는 값 대신 파일과 규칙 이름만 기록한다. 신규 커밋뿐 아니라 게시할 Git 이력도 검사한다.

Git hooks는 `git config core.hooksPath .githooks`로 활성화한다. 커밋 전 비밀값 검사, 푸시 전 공통 검증을 실행한다. hooks는 보조 장치이며 서버의 인증과 데이터 권한을 대신하지 않는다. 의존성 audit에서 높은 위험 또는 치명적 문제가 있으면 해결하거나 게시를 차단한다. 검사 실패를 `--no-verify` 또는 예외 목록으로 숨기지 않는다.

## 인증과 데이터 권한

서버 작업은 요청마다 사용자의 실제 인증을 확인한다. URL 또는 폼의 사용자 ID를 신뢰하지 않는다. Supabase의 사용자 데이터와 Storage는 RLS, 소유자 조건과 최소 권한으로 보호한다. 정책 파일의 존재와 운영 서버에 적용된 상태를 구분하여 기록한다. 운영 권한 검증이 안 된 앱은 쓰기와 업로드를 비활성화한다.

사용자 또는 외부 데이터는 신뢰하지 않는다. 문자열 길이, 배열 개수, 숫자 범위, URL 스킴, 요청 크기와 파일 크기를 검사한다. HTML 문자열을 직접 삽입하지 않는다. 외부 링크는 http/https만 허용하고 서버의 외부 요청은 허용된 호스트로 제한하며 타임아웃과 응답 크기 제한을 둔다. 사용자 입력의 URL을 서버에서 임의로 가져오지 않는다.

파일은 허용된 이미지 형식, 용량, 소유자 경로를 검사하고 공개 다운로드와 비공개 사용자 사진을 구분한다. 프런트엔드 제한과 DB/Storage의 원자적 제한을 함께 적용한다. 쿼리, 내보내기, 업로드, 사진 URL 생성은 페이지·배치·행 수에 상한을 둔다. 결과가 제한되면 화면에 안내하여 조용히 데이터를 누락하지 않는다. 메모리 기반 제한을 계정 전체의 비용 한도로 설명하지 않는다.

보안 헤더는 Vercel과 로컬 서버 모두에서 검증한다. 기본값은 nosniff, 프레임 삽입 차단, 제한된 Referrer Policy, 필요한 기능만 허용하는 Permissions Policy이다. CSP는 실제 Next/Vite, 로그인과 사진 로딩을 검증한 정책을 사용한다. 필수 동작을 깨뜨리는 정책이나 의미 없는 report-only 정책을 완전한 XSS 방어로 주장하지 않는다.

## 무료 운영 정책

무료 한도 초과 시 기능 제한 또는 중지를 허용한다. 유료 전환, 추가 과금, 자동 결제와 유료 API 활성화는 허용하지 않는다. 무료 여부를 확인할 수 없는 기능은 사용하지 않는다. 외부 생성형 AI 호출, 유료 API와 신규 수집 작업은 기본 비활성화하며 안전한 미리보기·수동 기록·기존 공개 데이터 읽기를 제공한다. 환경변수에 키가 존재하는 것만으로 호출을 허용하지 않는다.

Vercel은 실제 Hobby 플랜, Supabase는 실제 Free 플랜임을 계정에서 확인해야 한다. 코드의 선언과 `FREE_TIER_CONFIRMED` 환경변수는 계정 요금제 확인을 대체하지 않는다. 무료 한도를 넘으면 서비스를 제한하고 Pro, 추가 스토리지, 이미지 변환, 커스텀 도메인, 유료 AI, 유료 알림 등을 자동 선택하지 않는다. 서비스는 무료여도 다른 연결 제공자의 호출이 유료일 수 있으므로 제공자별로 확인한다.

GitHub Actions는 저장소 설정에서 비활성화한다. 수동 workflow도 실제 무료 사용 차단 설정을 확인하기 전에는 실행하지 않는다. 향후 활성화 시 최소 권한, 공식 action의 고정 SHA, 표준 Linux runner, 제한된 실행 시간과 동시 실행 수를 사용하며 artifact/cache 비용도 포함해 확인한다. Vercel의 `git.deploymentEnabled`는 기본 false로 두어 게시와 배포를 분리한다. 이 작업에서 계정 요금제 변경이나 새로운 배포를 수행하지 않는다.

## 검증과 운영 기록

변경마다 `pnpm verify`와 `pnpm audit --audit-level=high`를 수행한다. 인증·RLS·용량 제한·안전한 실패 경로는 격리 데이터베이스나 mock으로 검증한다. 운영 사용자 데이터 쓰기, 유료 API 호출과 실제 예약 수집을 테스트에 사용하지 않는다. WSL에서 빌드와 실제 브라우저 화면, 모바일 화면 및 클라이언트 오류를 확인한다. 로컬 검증 서버는 127.0.0.1에 바인딩한다.

새 SQL 정책은 별도 migration으로 작성하고 데이터 손실 없이 검토할 수 있게 한다. 적용 여부, 환경, 검증 명령, 남은 원격 설정을 `docs/SECURITY_REVIEW.md`에 기록한다. 사용자를 대신해 운영 DB를 파괴하거나 Git 이력을 강제 덮어쓰지 않는다. 백업은 비공개로 관리하고 운영 데이터 정리도 소유자와 보존 정책 확인 후 진행한다.

## 보장 범위와 공식 근거

절대적인 해킹 방지나 모든 외부 계정의 비용 0은 코드만으로 보장할 수 없다. 이 표준은 공격 경로를 줄이고, 확인되지 않은 비용 기능을 닫고, 실제 설정과 검증 결과를 구분하는 기준이다. 계정 플랜, 실제 RLS, MFA, OAuth 허용 URL과 결제 차단 설정의 미확인은 남은 작업으로 명시한다.

- [Vercel Hobby 요금제와 무료 한도](https://vercel.com/docs/plans/hobby)
- [Vercel Git 자동 배포 차단](https://vercel.com/docs/project-configuration/git-configuration)
- [Supabase Free와 비용 제어 범위](https://supabase.com/docs/guides/platform/cost-control)
- [GitHub Actions 사용량과 과금](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub 사용량 예산과 중지 설정](https://docs.github.com/en/billing/how-tos/set-up-budgets)
