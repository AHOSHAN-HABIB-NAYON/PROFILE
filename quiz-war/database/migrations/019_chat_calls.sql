-- 1-to-1 audio calls are logged in the chat as kind = 'call' (body keeps plain text for older apps).
-- call_status: done / missed / declined / cancelled / busy; media_secs = talk time.
ALTER TABLE chat_messages ADD COLUMN call_status VARCHAR(10) NULL;
