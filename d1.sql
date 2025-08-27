BEGIN TRANSACTION;


-- -------------------------
-- 1) 전역 사용자/사이트/멤버십
-- -------------------------


-- 전역 사용자
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at      DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);


-- 사이트(홈페이지)
CREATE TABLE sites (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id   INTEGER NOT NULL,
  name            TEXT NOT NULL,
  subdomain       TEXT UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free',                -- 예: free, pro, enterprise
  quota_pages     INTEGER,                                      -- 선택: 페이지 수 제한
  quota_assets_mb INTEGER,                                      -- 선택: 에셋 용량 제한(MB)
  created_at      DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE INDEX idx_sites_owner ON sites(owner_user_id);


-- 사이트 멤버십(RBAC)
CREATE TABLE site_users (
  site_id   INTEGER NOT NULL,
  user_id   INTEGER NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  added_at  DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (site_id, user_id),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE INDEX idx_site_users_user ON site_users(user_id);


-- -------------------------
-- 2) 페이지 라이브러리
-- -------------------------


-- 페이지(초안/게시/메타)
CREATE TABLE pages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      INTEGER NOT NULL,
  path         TEXT NOT NULL,                -- 최종 라우팅 경로(예: '/', '/about', '/blog/x')
  title        TEXT,
  content_html TEXT,                         -- 게시본(정적 산출물 참조 전/후)
  draft_json   TEXT CHECK (draft_json IS NULL OR json_valid(draft_json)),
  seo_json     TEXT CHECK (seo_json IS NULL OR json_valid(seo_json)),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  updated_by   INTEGER,
  created_at   DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at   DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (site_id, path),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);


CREATE INDEX idx_pages_site ON pages(site_id);
CREATE INDEX idx_pages_status ON pages(site_id, status);


-- updated_at 자동 갱신 트리거
CREATE TRIGGER trg_pages_updated_at
AFTER UPDATE ON pages
FOR EACH ROW
BEGIN
  UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;


-- 퍼블리싱 잡(부분/전체)
CREATE TABLE publish_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      INTEGER NOT NULL,
  scope        TEXT NOT NULL CHECK (scope IN ('full','partial')),
  target_paths TEXT,                                            -- CSV 또는 JSON 문자열
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','success','failed')),
  log_text     TEXT,
  created_by   INTEGER,
  created_at   DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  started_at   DATETIME,
  finished_at  DATETIME,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);


CREATE INDEX idx_publish_jobs_site ON publish_jobs(site_id);
CREATE INDEX idx_publish_jobs_status ON publish_jobs(site_id, status);


-- 에셋(S3/스토리지 메타)
CREATE TABLE assets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     INTEGER NOT NULL,
  key_path    TEXT NOT NULL,                                     -- 'sites/{site_id}/assets/...'
  mime_type   TEXT,
  size_bytes  INTEGER,
  created_by  INTEGER,
  created_at  DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (site_id, key_path),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);


CREATE INDEX idx_assets_site ON assets(site_id);


-- -------------------------
-- 3) 내비게이션 트리
-- -------------------------


-- 메뉴 트리(계층)
CREATE TABLE nav_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       INTEGER NOT NULL,
  parent_id     INTEGER,                                        -- NULL이면 루트
  -- 메뉴 표시용
  title         TEXT NOT NULL,
  icon          TEXT,
  visible       INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  require_auth  INTEGER NOT NULL DEFAULT 0 CHECK (require_auth IN (0,1)),
  roles         TEXT,                                            -- JSON 배열 문자열, 선택
  order_no      INTEGER NOT NULL DEFAULT 0,


  -- 링크/라우팅
  type          TEXT NOT NULL CHECK (type IN ('internal','external','anchor','dynamic')),
  slug          TEXT,                                            -- internal/dynamic 경로 조각('about','[id]')
  href          TEXT,                                            -- external/anchor 혹은 완전 경로
  route_params  TEXT CHECK (route_params IS NULL OR json_valid(route_params)),


  -- SEO/메타
  seo_json      TEXT CHECK (seo_json IS NULL OR json_valid(seo_json)),


  created_at    DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at    DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),


  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES nav_items(id) ON DELETE CASCADE
);


CREATE INDEX idx_nav_items_site ON nav_items(site_id);
CREATE INDEX idx_nav_items_parent ON nav_items(site_id, parent_id, order_no);


CREATE TRIGGER trg_nav_items_updated_at
AFTER UPDATE ON nav_items
FOR EACH ROW
BEGIN
  UPDATE nav_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;


-- -------------------------
-- 4) 유틸리티 메뉴(Header/Footer/Topbar/Bottombar)
-- -------------------------


CREATE TABLE utility_menus (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      INTEGER NOT NULL,
  area         TEXT NOT NULL CHECK (area IN ('header','footer','topbar','bottombar')),
  layout_json  TEXT NOT NULL CHECK (json_valid(layout_json)),
  visible      INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  created_at   DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at   DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (site_id, area),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);


CREATE INDEX idx_utility_menus_site ON utility_menus(site_id);


CREATE TRIGGER trg_utility_menus_updated_at
AFTER UPDATE ON utility_menus
FOR EACH ROW
BEGIN
  UPDATE utility_menus SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;


-- -------------------------
-- 5) 리다이렉트 규칙
-- -------------------------


CREATE TABLE redirects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      INTEGER NOT NULL,
  from_path    TEXT NOT NULL,
  to_path      TEXT NOT NULL,
  status_code  INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308)),
  preserve_query INTEGER NOT NULL DEFAULT 0 CHECK (preserve_query IN (0,1)),
  created_at   DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (site_id, from_path),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);


CREATE INDEX idx_redirects_site ON redirects(site_id);


-- -------------------------
-- 6) 무결성/검증을 돕는 보조 제약/뷰(선택)
-- -------------------------


-- 페이지 경로는 '/'로 시작하도록(선택 규칙)
CREATE TRIGGER trg_pages_path_format
BEFORE INSERT ON pages
FOR EACH ROW
WHEN NEW.path IS NOT NULL AND substr(NEW.path,1,1) <> '/'
BEGIN
  SELECT RAISE(ABORT, 'pages.path must start with "/"');
END;


CREATE TRIGGER trg_pages_path_format_update
BEFORE UPDATE OF path ON pages
FOR EACH ROW
WHEN NEW.path IS NOT NULL AND substr(NEW.path,1,1) <> '/'
BEGIN
  SELECT RAISE(ABORT, 'pages.path must start with "/"');
END;


-- nav_items.roles가 존재하면 JSON 배열이어야 함(선택)
CREATE TRIGGER trg_nav_items_roles_json
BEFORE INSERT ON nav_items
FOR EACH ROW
WHEN NEW.roles IS NOT NULL AND json_valid(NEW.roles) = 0
BEGIN
  SELECT RAISE(ABORT, 'nav_items.roles must be valid JSON array');
END;


CREATE TRIGGER trg_nav_items_roles_json_upd
BEFORE UPDATE OF roles ON nav_items
FOR EACH ROW
WHEN NEW.roles IS NOT NULL AND json_valid(NEW.roles) = 0
BEGIN
  SELECT RAISE(ABORT, 'nav_items.roles must be valid JSON array');
END;


-- -------------------------
-- 7) 권장 인덱스(검색/검증/빌드)
-- -------------------------


-- 페이지 검색(제목/경로) 용도 - LIKE 검색 최적화는 FTS를 별도 고려
CREATE INDEX idx_pages_title ON pages(title);
CREATE INDEX idx_pages_path ON pages(path);


-- 메뉴 검증용(타입/표시여부)
CREATE INDEX idx_nav_items_visible ON nav_items(site_id, visible);
CREATE INDEX idx_nav_items_type ON nav_items(site_id, type);


COMMIT;