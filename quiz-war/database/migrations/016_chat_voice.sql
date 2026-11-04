-- Voice messages in chat. `body` keeps a short text so older app versions still show something.
-- The audio file is deleted by the retention job (admin chooses days); media_url NULL = expired.
ALTER TABLE chat_messages ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'text';
ALTER TABLE chat_messages ADD COLUMN media_url VARCHAR(500) NULL;
ALTER TABLE chat_messages ADD COLUMN media_secs SMALLINT UNSIGNED NULL;
ALTER TABLE chat_messages ADD COLUMN media_bytes INT UNSIGNED NULL;
CREATE INDEX ix_chat_media ON chat_messages (kind, created_at);
