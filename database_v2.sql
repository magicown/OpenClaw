-- AI 처리 파이프라인 v2 마이그레이션
-- 실행 전 반드시 백업할 것: mysqldump -u root -p qna_board > backup_before_v2.sql

USE qna_board;

-- 1. posts.status를 ENUM에서 VARCHAR(30)으로 변경 (기존 값 유지)
ALTER TABLE posts MODIFY COLUMN status VARCHAR(30) DEFAULT 'registered';

-- 2. AI 분석 결과 저장 테이블
CREATE TABLE IF NOT EXISTS ai_analysis_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  phase ENUM('preprocess','pdca','impact','execution') NOT NULL,
  iteration INT DEFAULT 1,
  organized_question TEXT,
  pdca_plan TEXT,
  impact_analysis TEXT,
  execution_result TEXT,
  raw_claude_output LONGTEXT,
  admin_feedback TEXT,
  status ENUM('pending','completed','failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  INDEX idx_post_phase (post_id, phase),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 텔레그램 승인 추적 테이블
CREATE TABLE IF NOT EXISTS telegram_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  analysis_id INT NOT NULL,
  telegram_message_id BIGINT,
  callback_data VARCHAR(100),
  action ENUM('pending','approved','rejected') DEFAULT 'pending',
  admin_feedback TEXT,
  acted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  INDEX idx_post_id (post_id),
  INDEX idx_action (action),
  INDEX idx_callback (callback_data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 서버 실행 로그 테이블
CREATE TABLE IF NOT EXISTS execution_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  analysis_id INT,
  server_id INT,
  command TEXT NOT NULL,
  output TEXT,
  exit_code INT,
  rollback_command TEXT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  INDEX idx_post_id (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
