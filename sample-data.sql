-- 샘플 데이터 삽입
BEGIN TRANSACTION;

-- 1. 사용자 생성
INSERT INTO users (email, password_hash, name, status) VALUES
('admin@example.com', '$2a$10$YourHashedPasswordHere1', '관리자', 'active'),
('john@example.com', '$2a$10$YourHashedPasswordHere2', 'John Doe', 'active'),
('jane@example.com', '$2a$10$YourHashedPasswordHere3', 'Jane Smith', 'active'),
('editor@example.com', '$2a$10$YourHashedPasswordHere4', '편집자', 'active'),
('viewer@example.com', '$2a$10$YourHashedPasswordHere5', '뷰어', 'active');

-- 2. 사이트 생성
INSERT INTO sites (owner_user_id, name, subdomain, plan, quota_pages, quota_assets_mb) VALUES
(1, 'MyCerti 공식 사이트', 'mycerti', 'enterprise', 1000, 5000),
(2, 'John의 개인 블로그', 'johnblog', 'pro', 100, 500),
(3, 'Jane의 포트폴리오', 'janeportfolio', 'free', 10, 100),
(1, '테스트 사이트', 'test-site', 'pro', 50, 250);

-- 3. 사이트 멤버십 설정
INSERT INTO site_users (site_id, user_id, role) VALUES
(1, 1, 'owner'),
(1, 2, 'admin'),
(1, 3, 'editor'),
(1, 5, 'viewer'),
(2, 2, 'owner'),
(2, 4, 'editor'),
(3, 3, 'owner'),
(4, 1, 'owner'),
(4, 4, 'editor');

-- 4. 페이지 생성
INSERT INTO pages (site_id, path, title, content_html, draft_json, seo_json, status, updated_by) VALUES
-- MyCerti 사이트 페이지
(1, '/', '홈', '<h1>MyCerti에 오신 것을 환영합니다</h1><p>디지털 인증서 관리 플랫폼</p>', 
 '{"blocks":[{"type":"heading","data":{"text":"MyCerti에 오신 것을 환영합니다","level":1}}]}',
 '{"title":"MyCerti - 디지털 인증서 관리","description":"안전하고 효율적인 디지털 인증서 관리 플랫폼","keywords":["인증서","디지털","관리"]}',
 'published', 1),

(1, '/about', '회사 소개', '<h1>회사 소개</h1><p>MyCerti는 혁신적인 인증서 관리 솔루션을 제공합니다.</p>',
 '{"blocks":[{"type":"heading","data":{"text":"회사 소개","level":1}}]}',
 '{"title":"회사 소개 - MyCerti","description":"MyCerti 회사 소개 및 비전"}',
 'published', 1),

(1, '/services', '서비스', '<h1>우리의 서비스</h1><ul><li>디지털 인증서 발급</li><li>인증서 관리</li><li>검증 서비스</li></ul>',
 '{"blocks":[{"type":"heading","data":{"text":"우리의 서비스","level":1}}]}',
 '{"title":"서비스 - MyCerti","description":"MyCerti가 제공하는 서비스"}',
 'published', 1),

(1, '/contact', '연락처', '<h1>문의하기</h1><p>이메일: contact@mycerti.com</p><p>전화: 02-1234-5678</p>',
 '{"blocks":[{"type":"heading","data":{"text":"문의하기","level":1}}]}',
 '{"title":"연락처 - MyCerti","description":"MyCerti 문의 및 연락처"}',
 'published', 1),

(1, '/blog/welcome', '첫 블로그 포스트', '<h1>MyCerti 블로그에 오신 것을 환영합니다</h1><p>이것은 첫 번째 블로그 포스트입니다.</p>',
 '{"blocks":[{"type":"heading","data":{"text":"첫 블로그 포스트","level":1}}]}',
 '{"title":"첫 블로그 포스트","description":"MyCerti 블로그 첫 포스트"}',
 'draft', 3),

-- John의 블로그 페이지
(2, '/', 'John의 블로그', '<h1>안녕하세요, John입니다</h1><p>개발과 기술에 대한 이야기를 나눕니다.</p>',
 '{"blocks":[{"type":"heading","data":{"text":"John의 블로그","level":1}}]}',
 '{"title":"John의 기술 블로그","description":"개발과 기술 이야기"}',
 'published', 2),

(2, '/posts/first', '첫 포스트', '<h1>블로그를 시작합니다</h1><p>오늘부터 블로그를 시작합니다.</p>',
 '{"blocks":[{"type":"heading","data":{"text":"블로그를 시작합니다","level":1}}]}',
 '{"title":"첫 포스트 - John의 블로그","description":"블로그 시작"}',
 'published', 2),

-- Jane의 포트폴리오
(3, '/', 'Jane Smith - 포트폴리오', '<h1>Jane Smith</h1><p>UI/UX 디자이너</p>',
 '{"blocks":[{"type":"heading","data":{"text":"Jane Smith","level":1}}]}',
 '{"title":"Jane Smith - UI/UX Designer","description":"포트폴리오"}',
 'published', 3),

(3, '/works', '작업물', '<h1>포트폴리오</h1><p>다양한 프로젝트를 진행했습니다.</p>',
 '{"blocks":[{"type":"heading","data":{"text":"포트폴리오","level":1}}]}',
 '{"title":"작업물 - Jane Smith","description":"디자인 포트폴리오"}',
 'published', 3);

-- 5. 네비게이션 아이템 생성
-- MyCerti 사이트 메뉴
INSERT INTO nav_items (site_id, parent_id, title, icon, visible, require_auth, order_no, type, slug, href) VALUES
(1, NULL, '홈', 'home', 1, 0, 1, 'internal', '/', '/'),
(1, NULL, '회사소개', 'info', 1, 0, 2, 'internal', 'about', '/about'),
(1, NULL, '서비스', 'briefcase', 1, 0, 3, 'internal', 'services', '/services'),
(1, NULL, '블로그', 'book', 1, 0, 4, 'dynamic', 'blog', '/blog'),
(1, NULL, '문의하기', 'mail', 1, 0, 5, 'internal', 'contact', '/contact');

-- 서비스 하위 메뉴
INSERT INTO nav_items (site_id, parent_id, title, icon, visible, require_auth, order_no, type, slug, href) VALUES
(1, 3, '인증서 발급', NULL, 1, 1, 1, 'internal', 'issue', '/services/issue'),
(1, 3, '인증서 관리', NULL, 1, 1, 2, 'internal', 'manage', '/services/manage'),
(1, 3, '검증 서비스', NULL, 1, 0, 3, 'internal', 'verify', '/services/verify');

-- John의 블로그 메뉴
INSERT INTO nav_items (site_id, parent_id, title, icon, visible, require_auth, order_no, type, slug, href) VALUES
(2, NULL, '홈', 'home', 1, 0, 1, 'internal', '/', '/'),
(2, NULL, '포스트', 'file-text', 1, 0, 2, 'dynamic', 'posts', '/posts'),
(2, NULL, 'GitHub', 'github', 1, 0, 3, 'external', NULL, 'https://github.com/johndoe'),
(2, NULL, 'LinkedIn', 'linkedin', 1, 0, 4, 'external', NULL, 'https://linkedin.com/in/johndoe');

-- 6. 유틸리티 메뉴 설정
INSERT INTO utility_menus (site_id, area, layout_json, visible) VALUES
(1, 'header', '{"logo":{"text":"MyCerti","href":"/"},"items":["nav","search","auth"]}', 1),
(1, 'footer', '{"columns":[{"title":"회사","items":[{"text":"소개","href":"/about"},{"text":"팀","href":"/team"}]},{"title":"지원","items":[{"text":"도움말","href":"/help"},{"text":"문의","href":"/contact"}]}],"copyright":"© 2025 MyCerti. All rights reserved."}', 1),
(2, 'header', '{"logo":{"text":"John Blog","href":"/"},"items":["nav"]}', 1),
(3, 'header', '{"logo":{"text":"Jane Smith","href":"/"},"items":["nav","contact"]}', 1);

-- 7. 에셋 메타데이터
INSERT INTO assets (site_id, key_path, mime_type, size_bytes, created_by) VALUES
(1, 'sites/1/assets/logo.png', 'image/png', 15234, 1),
(1, 'sites/1/assets/hero-banner.jpg', 'image/jpeg', 102400, 1),
(1, 'sites/1/assets/documents/terms.pdf', 'application/pdf', 45678, 1),
(2, 'sites/2/assets/profile.jpg', 'image/jpeg', 8192, 2),
(3, 'sites/3/assets/portfolio/project1.png', 'image/png', 204800, 3);

-- 8. 퍼블리시 작업 기록
INSERT INTO publish_jobs (site_id, scope, target_paths, status, log_text, created_by, created_at, started_at, finished_at) VALUES
(1, 'full', NULL, 'success', 'Successfully published all pages', 1, datetime('now', '-2 days'), datetime('now', '-2 days', '+1 minute'), datetime('now', '-2 days', '+5 minutes')),
(1, 'partial', '/,/about,/services', 'success', 'Published 3 pages', 1, datetime('now', '-1 day'), datetime('now', '-1 day', '+1 minute'), datetime('now', '-1 day', '+2 minutes')),
(2, 'full', NULL, 'success', 'Site published', 2, datetime('now', '-3 hours'), datetime('now', '-3 hours', '+1 minute'), datetime('now', '-3 hours', '+3 minutes'));

-- 9. 리다이렉트 규칙
INSERT INTO redirects (site_id, from_path, to_path, status_code, preserve_query) VALUES
(1, '/old-about', '/about', 301, 1),
(1, '/service', '/services', 301, 0),
(2, '/blog', '/posts', 301, 1);

COMMIT;