-- Forwarded photos / voice messages share the original file (no second upload).
-- forward_of = the original message; media_gone = 'owner' when the owner deleted the original.
ALTER TABLE chat_messages ADD COLUMN forward_of BIGINT UNSIGNED NULL;
ALTER TABLE chat_messages ADD COLUMN media_gone VARCHAR(10) NULL;
CREATE INDEX ix_chat_forward ON chat_messages (forward_of);
