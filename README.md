# 가인 GA;IN

음악 동호회 가인의 공개 홈페이지와 관리 화면입니다. 현재 개발·보안 기준일은 **2026-10-03**입니다. 운영 공개 주소는 [gain-music-club.vercel.app](https://gain-music-club.vercel.app)이며 GitHub 게시와 운영 배포는 별개입니다.

## 현재 동작과 최초 실행

처음 실행하면 외부 연결 없는 **safe fallback**으로 소개·기본 공지·빈 일정/앨범을 표시합니다. 기존 `.env.local`에 키가 있어도 기대 프로젝트 설정이 없으면 외부 클라이언트를 만들지 않습니다. `/admin`은 연결 검증 대기 화면이며 **로그인·쓰기·업로드는 코드에서 차단**되어 있습니다. 환경 플래그나 계정 생성으로 이 차단을 해제할 수 없습니다.

WSL Ubuntu `/home/eykim/projects/Gain`에서 Node.js **24.19.0**, pnpm **11.19.0**을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

검증은 다음 명령으로 수행합니다. `build`가 공통 flock을 내부에서 획득하므로 같은 lock으로 `verify`를 다시 감싸지 않습니다.

```sh
pnpm verify
pnpm audit --audit-level=high
pnpm security:history
```

`.env.local`은 비공개로 보존하고 Git에 넣지 않습니다. 최초 실행에는 새 프로젝트·관리자 계정·유료 플랜이 필요하지 않습니다. `.env.example`의 값은 모두 비어 있습니다.

## Supabase 읽기 연결 조건과 운영 미적용

확인된 기존 Supabase 프로젝트 **gain-music-club**은 조직 ‘은열’의 Free 프로젝트이며 Iam9P와 공유합니다. 기존 `public.photos` 등은 Iam9P 데이터/정책을 사용합니다. 기존 `supabase/schema.sql`, seed와 public용 migration은 과거 이력이며 **현재 공유 프로젝트 설치 절차가 아닙니다**.

현행 검토안은 `supabase/review/20261003_gain_isolated.sql`입니다. 새 **gain 스키마**와 **gain-public-media-v1 버킷**을 사용하며 기존 public 사진/테이블을 변환하지 않습니다. 전체 SQL은 단일 트랜잭션으로 실패 시 부분 설치가 롤백되도록 작성했습니다. **운영에는 적용하지 않았고 실제 gain 스키마 테이블도 없는 상태**입니다. 이 문서는 SQL 실행이나 배포를 지시하지 않습니다.

익명 읽기 연결을 검토하려면 준비된 gain 스키마의 노출·RLS·버킷 권한과 기존 공유 프로젝트 정책 충돌을 먼저 확인해야 합니다. 코드의 읽기 조건은 `VITE_GAIN_EXPECTED_PROJECT_REF`와 일치하는 정확한 HTTPS Supabase origin 및 공개 publishable/anon 키입니다. anon JWT는 role/ref도 확인합니다. publishable 키의 실제 프로젝트 연결은 원격에서 확인해야 합니다. service_role/secret 키는 브라우저 환경에 넣지 않습니다. 조건을 만족해도 **읽기만 가능하며 로그인·쓰기·업로드는 여전히 불가능**합니다. 현재는 빈 기대 프로젝트 설정과 기본 fallback을 유지합니다.

## 저장량 예산과 무료 운영

Gain 검토 SQL은 파일당 2MiB를 예약하여 **125개·250MiB**로 제한합니다. Iam9P의 동일 예산과 합쳐 공유 설계 합계는 **500MiB**입니다. 실제 기존 파일·다른 버킷·다운로드 전송량은 별도 점검 대상이고, 이 예산을 계정 전체 비용 보장으로 해석하지 않습니다. 조회에는 테이블당 1,000행/20페이지, 응답 2MiB/10초 제한과 한도 초과 안내가 있습니다.

상위 세션이 실제 Vercel Hobby, Supabase Free, 비공개 GitHub 저장소와 Actions 비활성화를 확인했습니다. 자기선언 환경 플래그는 실제 billing 확인이 아닙니다. Gain에는 생성형 AI·뉴스 수집 기능이 없습니다. 무료 한도 초과 시 기능 제한·중지를 허용하며 유료 자원이나 자동 결제를 활성화하지 않습니다.

## 게시·배포와 검증 상태

GitHub 형상관리 게시와 운영 서비스 변경을 분리합니다. Vercel Git 자동배포는 `git.deploymentEnabled=false`이며 CI는 수동 workflow만 남기고 원격 Actions 자체를 비활성화했습니다. 현재 변경을 운영 배포하거나 검토 SQL을 적용하지 않았습니다. 배포 스크립트와 과거 API 배포 기록은 현재 실행 절차가 아닙니다.

보안 검사·ESLint·Vue/TypeScript 검사·15개 Node 테스트·격리 PostgreSQL RLS/125개·250MiB quota/전체 migration 롤백 검증·빌드·의존성 감사가 통과했습니다. 데스크톱/모바일 기본 화면에서 외부 요청과 클라이언트 오류가 없고 로그인 차단 및 HTTP 보안 헤더를 확인했습니다. 실제 Supabase Storage enforcement, 동시 업로드 부하, 운영 권한·스키마 적용은 미확인입니다.

현재 절차는 [공통 개발 표준](docs/DEVELOPMENT_STANDARD.md)과 [보안 검토](docs/SECURITY_REVIEW.md)를 따릅니다. [2026-10-02 운영 기록](docs/OPERATIONS.md)과 `docs/OPERATIONS_SNAPSHOT.json`은 날짜가 있는 과거 증거로 보존하며 현재 설치·활성화 안내로 사용하지 않습니다.
