# 가인 (Gain) 2026-10-02 과거 운영 검토 기록

> 현재 절차 아님: 아래 내용·명령·배포 ID·public SQL 예시는 2026-10-02 당시의 과거 검토 기록이다. 2026-10-03부터는 README, DEVELOPMENT_STANDARD.md 및 SECURITY_REVIEW.md가 현재 기준이다. 공유 프로젝트의 public 테이블을 초기화하지 않는다. 현재 gain 격리 SQL은 운영 미적용이며 로그인·쓰기·업로드는 코드에서 차단되어 있다. 아래 예시를 설치·CI 활성화·배포 지시로 실행하지 않는다. Node24.19.0/pnpm11.19.0, Actions 비활성화 및 Vercel 자동배포 차단을 유지한다.

확인일: 2026-10-02 KST. 이 문서는 현재 원격 API·운영 응답·로컬 설정을 재확인한 기록이다. 예전 README의 완료 기록과 현재 로컬 변경을 구분한다. 이번 작업은 운영 문서·CI·배포 스크립트·설정만 수정하고 운영 배포/실제 서비스 설정/DB 적용은 수행하지 않는다.

## 최종 로컬 검증

최종: TypeScript·7개 테스트·감사·Vite 빌드 통과. 배포 플래그/별도 환경 파일 없이 실행하면 인증/업로드 전에 중단하는 것을 확인했다. 초기 esbuild 샌드박스 권한 오류는 승인된 로컬 검증 환경에서 재검증해 해소됐다. 린트 도구는 미구성. 운영 배포는 미실행.

현재 운영 의존성 감사는 네 앱 모두 0건이다. 아래 초기 감사/실패 기록은 재확인 시점의 이력이며 최종 상태와 구분한다. 새 코드를 운영에 배포한 것으로 해석하지 않는다.

## 확인 상태와 우선순위

운영 주소: https://gain-music-club.vercel.app
최근 Production READY 배포: `dpl_4aqwDmft5nbvWW11bqUXy7CrZApU`
실제 Vercel Node: 24.x. 검증 기준: Node 24.x / pnpm 11.19.0.
원격 상세 근거는 `docs/OPERATIONS_SNAPSHOT.json`에 변수 이름·대상·설정·배포 ID만 기록한다. 공통 원본은 `webapp-operations/remote-inspection.json`이다.

- 실제 Vercel 프로젝트 framework/buildCommand/installCommand가 모두 null이며 환경변수도 없다. 운영은 로컬 Vite 빌드의 dist만 API 업로드한 형태이다. 루트 vercel.json의 Git 빌드 경로와 혼동하지 않는다.
- Git 연결 및 로컬 .git이 없다. 현재 운영 배포 커밋은 확인할 수 없다.
- 기본 보안 헤더는 운영 응답에서 확인했다. CSP는 없으며 필요한 OAuth·Supabase·영상 연결을 조사한 후 report-only 방식부터 준비한다.
- 기존 deploy는 검사 없이 남아 있는 dist를 올렸다. 새 deploy는 `--production --env-file <isolated-production-file>`을 요구하며 지정 파일의 공개 Supabase 값으로 검사·감사·새 빌드를 성공시킨 뒤 업로드한다. secret/service_role 키는 차단한다.
- 새 명령: `node scripts/deploy.mjs --production --env-file <isolated-production-file>`. 명령에 실제 키를 넣지 않는다. 별도 파일을 저장소·빌드 업로드 밖에 보관한다.
- `node scripts/deploy.mjs --check`는 기존처럼 계정/요금제만 확인하고 배포하지 않는다.
- VITE_*는 빌드 시 JS에 들어간다. Vercel 환경변수만 바꾸는 것으로 기존 정적 파일의 DB 연결은 변경되지 않는다. Preview는 독립 DB로 새 빌드하고 Production 파일을 복사하지 않는다.
- 검증: TypeScript·7개 테스트·Vite 빌드 통과, 운영 의존성 감사 0건. 500kB 초과 청크 경고는 코드 세션에서 분할 여부를 검토한다. 이번 세션은 UI/도메인 코드를 수정하지 않는다.

## 배포 전 관문

```sh
pnpm install --frozen-lockfile
node scripts/ops-check.mjs
# 검사와 분리된 현재 소스 재고만 만들 때:
node scripts/ops-check.mjs --manifest-only
```

ops-check는 Node/pnpm 버전을 확인하고 타입검사, 설정된 린트, 기존 테스트, `pnpm audit --prod --audit-level high`, 빌드를 순서대로 수행한다. 하나라도 실패하면 종료 코드가 0이 아니며 배포를 진행하지 않는다. 현재 린트 스크립트가 없다. 이를 명시적으로 경고하며 린트 완료로 간주하지 않는다. 린트 도구/의존성 도입은 코드 담당자와 별도 조정한다.
네트워크/감사 서비스 오류를 통과로 간주하지 않는다. 로컬 샌드박스의 빌드 도구 권한 오류는 동일 명령을 승인된 로컬 검증 환경에서 재실행해 코드 실패와 구분한다.

`.github/workflows/operations.yml`은 배포하지 않고 같은 관문을 실행한다. 저장소에 업로드하고 `verify` 상태 검사를 보호 브랜치의 필수 조건으로 설정해야 운영 통제가 된다. Actions 파일 추가만으로 Vercel의 자동 배포 선행 조건이 생기지는 않는다. Next 앱은 vercel.json에 prebuild 관문도 넣었다. `--prebuild`는 버전·타입·설정된 린트·테스트·감사까지만 수행하고 실제 빌드는 뒤의 build 명령이 수행한다. 로컬 전체 검사와 원격 빌드를 모두 통과해야 릴리스 완료이다.
운영 키를 PR/CI에 전달하지 않는다. 실제 OAuth/Storage/DB 통합 검증은 독립 환경과 별도 테스트 계정으로 수행한다.

## 릴리스와 SQL 이력

`.deployment/release-manifest.json`에는 실행 시각·도구 버전·Git HEAD(존재할 때)·dirty 상태·소스 SHA-256·SQL 파일별 SHA-256·검증 단계와 verified가 기록된다. 환경 파일·인증·의존성·빌드 출력·백업은 제외한다. `verified=false, stage=inventory`는 통과 기록이 아니다. `stage=prebuild`는 빌드 통과 기록이 아니다.
정적 바이너리/사진은 이 소스 manifest 해시에 포함되지 않는다. API 배포 스크립트는 업로드할 파일 payload 전체의 artifactSha256도 기록한다. 운영에 올리는 이미지·정적 산출물은 별도 산출물 해시와 보관 위치를 릴리스에 기록한다.
API 배포 스크립트가 있는 앱은 배포 ID별 release JSON도 보관한다. CI artifact는 검증 근거이고 실제 운영 배포 ID와 운영 DB 적용 내역은 사람이 대조하여 릴리스 기록에 추가한다. Git 없는 앱은 우선 소스 스냅샷과 manifest를 안전하게 보관하고 저장소 연결을 별도 결정한다.

SQL 해시는 저장소 파일의 존재를 증명할 뿐 운영 DB 적용을 증명하지 않는다. 운영자가 Supabase 적용 이력과 실제 객체를 읽어 대조하고 파일명·해시·대상 프로젝트·적용일·검증자·백업 위치를 아래 템플릿에 기록한다. 수동 SQL Editor 적용이면 CLI migration list만으로 판단하지 않는다. 이미 적용한 SQL을 재실행하거나 마이그레이션 이력을 임의로 repair하지 않는다. 새 SQL은 코드 세션에서 작성/검증한 뒤 별도 운영 반영 승인을 받는다.

```json
{
  "releasedAtKst": null,
  "deploymentId": null,
  "sourceCommit": null,
  "sourceSha256": null,
  "artifactSha256": null,
  "databaseProject": null,
  "migrations": [
    { "file": null, "sha256": null, "appliedAt": null, "verifiedBy": null }
  ],
  "previousReadyDeploymentId": "dpl_4aqwDmft5nbvWW11bqUXy7CrZApU",
  "smokeChecks": [],
  "rollbackResult": null
}
```

## 환경 분리와 보안

Development/Preview/Production마다 DB·Storage/Blob·OAuth 콜백·서버 키를 분리한다. 환경별 실제 리소스 ID와 변수 대상만 릴리스에 기록하고 키 값은 기록하지 않는다. Preview에는 운영용 API/DB 관리 권한을 제공하지 않는다. Vercel 변수 변경은 재배포 후에 적용 여부를 확인한다. 공개 변수라도 같은 DB를 가리키면 RLS가 정상인 계정도 실수로 운영 데이터에 쓸 수 있다.

Vercel·GitHub·Supabase·Google·뉴스/AI 제공자 운영 계정의 MFA, 복구 코드의 별도 보관, 최소 팀 권한, 이전 운영자 접근 회수, 토큰 회전을 점검한다. 현재 MFA 상태는 확인하지 못했으며 자동 활성화하지 않았다. 서비스 키는 서버 전용으로 보관하고 공개 빌드/CI artifact에 넣지 않는다.
기본 보안 헤더는 실제 운영 HTTP 응답에서 확인한다. CSP는 영상/인증/사진 흐름의 허용 출처를 검증한 후 report-only 단계로 도입한다. 이번 변경에는 검증되지 않은 CSP 차단 정책을 추가하지 않았다.

## 배포 후 확인과 롤백

1. 이전 READY 배포 ID·환경 대상·백업·DB 적용 내역을 기록한다. 독립 Preview에서 핵심 흐름을 먼저 검증한다.
2. 승인된 운영 반영 후 배포 READY, 운영 도메인, 소스 commit/hash와 설정 대상을 대조한다.
3. 비로그인 응답·로그인/로그아웃·모바일 화면·핵심 저장/조회·사진 접근·두 계정 격리·보안 헤더를 확인한다. 실제 운영 쓰기는 운영자가 승인한 테스트 계정에서만 수행한다. 기본 응답과 헤더는 `node scripts/check-release.mjs`로 확인하고, 이 검사는 실제 로그인/데이터 격리 검증을 대체하지 않는다.
4. 실패하면 새 반영을 중단한다. 운영자가 Vercel의 이전 READY 배포를 복구하고 도메인·핵심 흐름을 다시 확인한다. Vercel CLI/UI의 현재 rollback 권한과 대상은 반영 전 확인한다.
5. 앱 롤백은 DB/Storage/Blob/환경변수를 되돌리지 않는다. 이전 앱과 새 스키마의 호환성을 먼저 확인한다. 파괴적인 DB 역마이그레이션 대신 검증된 forward fix 또는 별도 승인한 복구 절차를 사용한다.
6. 장애 시각·대상 배포·검증 결과·복구 결과·데이터 영향·재발 방지를 릴리스 기록에 남긴다.

## 아직 운영 반영하지 않은 항목

CI 업로드/필수 검사 설정, 환경별 리소스 분리, MFA 확인, 새 보안 헤더 배포, 실제 통합 smoke, DB 적용 이력 대조, 백업/복원 리허설, 롤백 리허설은 운영자가 별도 수행해야 한다.
운영 반영 전 검사 실패와 Critical 감사 항목부터 해결한다. 현재 린트가 없는 앱은 그 한계를 릴리스 승인 자료에 명시한다.
