

## 공통 개발·보안 표준

변경 전에 docs/DEVELOPMENT_STANDARD.md와 docs/SECURITY_REVIEW.md를 읽는다. WSL 소스와 Node 24.19.0, pnpm 11.19.0을 사용하고 pnpm install --frozen-lockfile로 설치한다. 비밀값·환경파일·개인 데이터·생성 산출물은 Git에 넣지 않는다. pnpm verify와 pnpm audit --audit-level=high를 통과시킨다. .githooks를 우회하지 않는다.

외부 AI·신규 수집과 검증되지 않은 원격 쓰기 차단을 환경변수의 자기선언만으로 해제하지 않는다. 유료 요금제나 API를 활성화하지 않는다. 무료 한도 초과 시 중지한다. 실제 운영 정책과 코드에 작성한 정책의 적용 여부를 구분해 기록한다. 기존 Windows 원본·환경파일·사용자 변경과 Git 이력을 보존한다.
