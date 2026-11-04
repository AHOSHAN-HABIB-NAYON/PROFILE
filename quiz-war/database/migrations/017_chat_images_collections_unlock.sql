-- Photo messages in chat: width x height of the stored WebP (for the bubble size).
ALTER TABLE chat_messages ADD COLUMN media_dims VARCHAR(20) NULL;

-- Premium collections can also be unlocked with game coins (admin sets the price; 0 = no coin unlock).
ALTER TABLE categories ADD COLUMN unlock_coins INT UNSIGNED NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS user_collection_unlocks (
  user_id BIGINT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  coins INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT fk_ucu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
