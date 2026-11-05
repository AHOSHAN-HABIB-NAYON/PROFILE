-- Coin shop: cosmetic items now cost 10,000+ coins (power-up packs stay cheap), plus new items.
UPDATE shop_items SET price = 10000 WHERE item_key IN ('title_scholar', 'dice_ruby');
UPDATE shop_items SET price = 12000 WHERE item_key IN ('frame_neon', 'title_bcs_warrior');
UPDATE shop_items SET price = 15000 WHERE item_key IN ('frame_flame', 'dice_neon', 'theme_midnight', 'board_night');
UPDATE shop_items SET price = 18000 WHERE item_key IN ('title_genius', 'effect_confetti_gold');
UPDATE shop_items SET price = 20000 WHERE item_key IN ('frame_gold', 'dice_gold', 'board_wood');
INSERT IGNORE INTO shop_items (item_key, type, name, description, price, data, sort_order) VALUES
('frame_rainbow', 'frame', 'Rainbow Frame', 'All the colours around your photo', 25000, '{"css":"rainbow"}', 9),
('frame_diamond', 'frame', 'Diamond Frame', 'Icy shining diamond frame', 40000, '{"css":"diamond"}', 10),
('frame_royal', 'frame', 'Royal Frame', 'Purple and gold, fit for a king', 50000, '{"css":"royal"}', 11),
('title_legend', 'title', 'কিংবদন্তি', 'Profile title: কিংবদন্তি', 30000, '{"text":"কিংবদন্তি"}', 12),
('title_quiz_king', 'title', 'Quiz King', 'Profile title: Quiz King', 35000, '{"text":"Quiz King"}', 13),
('dice_emerald', 'ludo_dice', 'Emerald Dice', 'Green gem dice with gold dots', 20000, '{"face":"#059669","edge":"#064e3b","dot":"#fde047","one":"#ffffff"}', 35),
('dice_galaxy', 'ludo_dice', 'Galaxy Dice', 'Deep space purple with star dots', 30000, '{"face":"#4c1d95","edge":"#c084fc","dot":"#fef08a","one":"#f472b6"}', 36),
('dice_candy', 'ludo_dice', 'Candy Dice', 'Sweet pink dice', 15000, '{"face":"#f9a8d4","edge":"#db2777","dot":"#831843","one":"#7c3aed"}', 37),
('board_ocean', 'ludo_board', 'Ocean Board', 'Cool sea blue board', 25000, '{"cell":"#e0f2fe","line":"#7dd3fc","yard":"#f0f9ff","wrap":"#0c4a6e"}', 38),
('board_royal', 'ludo_board', 'Royal Board', 'Purple velvet with gold lines', 35000, '{"cell":"#f5f3ff","line":"#c4b5fd","yard":"#faf5ff","wrap":"#3b0764"}', 39),
('board_forest', 'ludo_board', 'Forest Board', 'Fresh green garden look', 20000, '{"cell":"#ecfccb","line":"#a3e635","yard":"#f7fee7","wrap":"#14532d"}', 40);
