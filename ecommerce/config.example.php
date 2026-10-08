<?php
/**
 * NovaShop configuration.
 *
 * 1. Copy this file to "config.php" in the same folder.
 * 2. Replace every value marked  >>> REPLACE <<<.
 * 3. Never commit config.php or share it publicly. It is blocked by .htaccess.
 *
 * Most store options (delivery charges, WhatsApp, colours, tracking IDs, courier
 * credentials…) are managed from Admin → Settings / Plugins and stored in the
 * database. The tracking/courier values below are only used as initial fallbacks
 * when nothing has been saved in the admin panel yet.
 */

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
define('APP_ENV', 'production');          // 'production' or 'local'
define('APP_DEBUG', false);               // NEVER true on a live site
define('APP_TIMEZONE', 'Asia/Dhaka');

// Public site URL WITHOUT trailing slash. Used for canonical URLs, sitemap,
// emails and Meta CAPI. Leave empty to auto-detect from the request.
define('APP_URL', '');                    // >>> REPLACE <<< e.g. 'https://yourshop.com'

// 64-character random secret used for encryption & signed cookies.
// Generate one: php -r "echo bin2hex(random_bytes(32));"
// Changing it later makes saved API credentials unreadable (re-enter them).
define('APP_KEY', 'CHANGE_ME_TO_64_RANDOM_HEX_CHARACTERS_xxxxxxxxxxxxxxxxxxxxxxxxxxxx'); // >>> REPLACE <<<

// Secret key required once to create the first admin account at /admin/setup.
define('INSTALL_KEY', 'CHANGE_ME_INSTALL_KEY');  // >>> REPLACE <<<

// ---------------------------------------------------------------------------
// Database (Hostinger: hPanel → Databases → MySQL Databases)
// ---------------------------------------------------------------------------
define('DB_HOST', 'localhost');           // >>> REPLACE <<< usually 'localhost' on Hostinger
define('DB_PORT', 3306);
define('DB_NAME', 'u000000000_shop');     // >>> REPLACE <<<
define('DB_USER', 'u000000000_shop');     // >>> REPLACE <<<
define('DB_PASS', 'your-database-password'); // >>> REPLACE <<<

// ---------------------------------------------------------------------------
// Store fallbacks (editable later in Admin → Settings)
// ---------------------------------------------------------------------------
define('STORE_NAME', 'NovaShop');
define('STORE_WHATSAPP', '+8801757827996');
define('STORE_EMAIL', 'support@example.com');
define('STORE_PHONE', '+8801757827996');

// ---------------------------------------------------------------------------
// Integrations — optional fallbacks (prefer Admin → Plugins, stored encrypted)
// These values are used ONLY on the server and are never printed in JavaScript,
// except the public IDs (pixel ID, GTM ID, Ads ID) which are public by design.
// ---------------------------------------------------------------------------
define('COURIER_API_TOKEN', 'BDC_COURIER_API_TOKEN'); // >>> REPLACE <<< api.bdcourier.com token
define('META_PIXEL_ID', '');              // public ID
define('META_ACCESS_TOKEN', '');          // SECRET — Conversions API token
define('META_TEST_CODE', '');             // e.g. TEST12345 while testing in Events Manager
define('GOOGLE_TAG_ID', '');              // GTM-XXXXXXX
define('GOOGLE_CONVERSION_ID', '');       // AW-XXXXXXXXX
define('GOOGLE_CONVERSION_LABEL', '');    // AbCdEfGhIjk
define('GOOGLE_CLIENT_ID', '');           // OAuth client ID for admin Google Sign-In (optional)
