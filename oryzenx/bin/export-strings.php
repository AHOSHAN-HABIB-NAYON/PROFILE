<?php
declare(strict_types=1);
// Exports the app strings (resources/lang/{en,bn}/app.php) to the Android app's bundled assets so the
// web apps and the Android app share one translation source. Run after editing translations:
//   php bin/export-strings.php
if (PHP_SAPI !== 'cli') { exit(1); }
$base = dirname(__DIR__);
foreach (['en', 'bn'] as $loc) {
    $lines = require "$base/resources/lang/$loc/app.php";
    $out = "$base/android/app/src/main/assets/i18n/$loc.json";
    @mkdir(dirname($out), 0777, true);
    file_put_contents($out, json_encode($lines, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
    echo "$out (" . count($lines) . " strings)\n";
}
