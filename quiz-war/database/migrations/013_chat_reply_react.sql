-- Replies (swipe to reply) and emoji reactions on chat messages.
ALTER TABLE chat_messages ADD COLUMN reply_to_id BIGINT UNSIGNED NULL AFTER body;

CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  reaction VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_chat_react_msg FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_react_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
