-- "Delete for me": each side can hide a message (or a whole chat) without touching the other side.
ALTER TABLE chat_messages
  ADD COLUMN hidden_for_sender TINYINT(1) NOT NULL DEFAULT 0 AFTER read_at,
  ADD COLUMN hidden_for_recipient TINYINT(1) NOT NULL DEFAULT 0 AFTER hidden_for_sender;
