-- Message requests: a chat from someone who isn't your friend waits until you accept (or reply).
CREATE TABLE IF NOT EXISTS chat_accepts (
  user_id BIGINT UNSIGNED NOT NULL,
  peer_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, peer_id),
  CONSTRAINT fk_chat_acc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_acc_peer FOREIGN KEY (peer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Delete for everyone" leaves a "message deleted" placeholder instead of vanishing.
ALTER TABLE chat_messages ADD COLUMN deleted_at DATETIME NULL AFTER read_at;

-- Chat-only block: stops messages but keeps the friendship, battles and the chat history.
CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT fk_chat_blk_a FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_blk_b FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
