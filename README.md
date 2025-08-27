# MyCerti API

홈빌더 솔루션을 위한 API 서버

## 기능

### 사용자 관리
- 회원가입/로그인
- JWT 기반 인증
- 사용자 정보 조회

### 사이트 관리
- 사이트 생성/수정/삭제
- 서브도메인 관리
- 플랜별 할당량 관리

### 관리자 기능
- 전체 사용자 관리
- 전체 사이트 관리
- 대시보드 통계

## API 엔드포인트

### 인증 API
```
POST /auth/signup    - 회원가입
POST /auth/login     - 로그인
GET  /auth/me        - 사용자 정보 조회
```

### 사이트 API (JWT 필요)
```
POST   /sites       - 사이트 생성
GET    /sites       - 사이트 목록
GET    /sites/:id   - 사이트 상세
PUT    /sites/:id   - 사이트 수정
DELETE /sites/:id   - 사이트 삭제
```

### 관리자 API (Admin JWT 필요)
```
POST   /admin/login      - 관리자 로그인
GET    /admin/dashboard  - 대시보드 통계
GET    /admin/users      - 사용자 목록
PUT    /admin/users/:id  - 사용자 수정
GET    /admin/sites      - 사이트 목록
PUT    /admin/sites/:id  - 사이트 수정
DELETE /admin/sites/:id  - 사이트 삭제
```

## 설치 및 실행

```bash
npm install
npm run db:migrate    # 데이터베이스 스키마 생성
npm run db:seed       # 샘플 데이터 삽입
npm run dev           # 개발 서버 실행
```

## 환경 설정

wrangler.json에서 다음 설정을 확인하세요:
- D1 데이터베이스 연결
- R2 버킷 연결
- JWT 시크릿 설정

## 관리자 계정

개발용 관리자 계정:
- 이메일: admin@mycerti.com
- 비밀번호: admin123