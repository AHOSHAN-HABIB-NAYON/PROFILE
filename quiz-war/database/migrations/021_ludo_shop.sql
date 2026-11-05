-- Ludo shop: dice skins and board themes (cosmetic only), plus what each player has equipped.
ALTER TABLE shop_items MODIFY COLUMN type ENUM('avatar','frame','theme','title','effect','power_up','ludo_dice','ludo_board') NOT NULL;
ALTER TABLE user_profiles ADD COLUMN ludo_dice VARCHAR(40) NULL;
ALTER TABLE user_profiles ADD COLUMN ludo_board VARCHAR(40) NULL;
INSERT IGNORE INTO shop_items (item_key, type, name, description, price, data, sort_order) VALUES
('dice_ruby', 'ludo_dice', 'Ruby Dice', 'Red dice with white dots', 300, '{"face":"#e11d48","edge":"#9f1239","dot":"#ffffff","one":"#fde047"}', 30),
('dice_neon', 'ludo_dice', 'Neon Dice', 'Dark dice with glowing dots', 450, '{"face":"#0f172a","edge":"#22d3ee","dot":"#22d3ee","one":"#f472b6"}', 31),
('dice_gold', 'ludo_dice', 'Golden Dice', 'Shiny gold dice for champions', 700, '{"face":"#facc15","edge":"#a16207","dot":"#78350f","one":"#b91c1c"}', 32),
('board_night', 'ludo_board', 'Night Board', 'Dark board, bright colours', 600, '{"cell":"#1e293b","line":"#334155","yard":"#0f172a","wrap":"#020617"}', 33),
('board_wood', 'ludo_board', 'Wooden Board', 'Classic warm wooden look', 800, '{"cell":"#fde7b0","line":"#c08a4a","yard":"#fef3c7","wrap":"#78350f"}', 34);
