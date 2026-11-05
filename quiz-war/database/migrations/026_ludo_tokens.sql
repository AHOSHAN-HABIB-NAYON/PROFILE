-- Ludo token (piece) designs in the shop; everyone in the game sees the owner's design.
ALTER TABLE shop_items MODIFY COLUMN type ENUM('avatar','frame','theme','title','effect','power_up','ludo_dice','ludo_board','ludo_token') NOT NULL;
ALTER TABLE user_profiles ADD COLUMN ludo_token VARCHAR(40) NULL;
INSERT IGNORE INTO shop_items (item_key, type, name, description, price, data, sort_order) VALUES
('token_ball', 'ludo_token', 'Glossy Ball', 'Shiny round pieces', 15000, '{"style":"ball"}', 41),
('token_star', 'ludo_token', 'Star Pieces', 'Bright star-shaped pieces', 20000, '{"style":"star"}', 42),
('token_gem', 'ludo_token', 'Diamond Gems', 'Sparkling diamond pieces', 30000, '{"style":"gem"}', 43),
('token_crown', 'ludo_token', 'Royal Crown', 'Pieces with a golden crown', 40000, '{"style":"crown"}', 44);
