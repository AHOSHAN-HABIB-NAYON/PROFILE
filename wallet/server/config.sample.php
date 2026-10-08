<?php
// Copy this file to config.php and fill in your own values.
// config.php holds secrets: never commit it or make it downloadable.

return [
    'app_name' => 'জমা ওয়ালেট',

    // Public address of the website, without a trailing slash.
    'base_url' => 'https://example.com',

    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'wallet',
        'user' => 'wallet',
        'pass' => 'change-me',
    ],

    // Google Cloud Console → APIs & Services → Credentials → OAuth client ID (type "Web application").
    // The Android app uses this same Web client ID to request ID tokens.
    'google_client_id' => '',

    'webauthn' => [
        // The domain passkeys belong to: base_url's host, e.g. "example.com".
        'rp_id' => 'example.com',
        // Extra web origins allowed to use passkeys (base_url is always allowed).
        'origins' => [],
        // The Android app, so its passkeys and Google sign-in are trusted for this domain.
        'android_package' => 'com.ahoshan.joma',
        // SHA-256 fingerprints of every key the app is signed with (shown in the README).
        // The test key in wallet/android/app/joma-test.keystore — add your release key's too.
        'android_cert_sha256' => [
            '51:25:AE:02:BD:5B:57:AA:7F:32:9A:4F:A5:1E:6A:3E:42:EB:D2:23:1C:07:9B:8D:0D:35:B2:32:82:04:56:21',
        ],
    ],

    'session_days' => 30,

    // Demo wallet limits, in taka.
    'limits' => [
        'deposit_min' => 10,
        'deposit_max' => 50000,
        'withdraw_min' => 50,
        'transfer_min' => 1,
        'transfer_max' => 25000,
    ],

    // Show internal error details in API responses. Keep false on a live site.
    'debug' => false,
];
