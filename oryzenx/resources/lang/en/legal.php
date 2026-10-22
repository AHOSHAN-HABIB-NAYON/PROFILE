<?php
// Baseline legal text. The operator should have these reviewed by a qualified lawyer for their jurisdiction
// before launch. Placeholders like the operator's legal name are intentionally generic.
return [
    'updated' => '2026-10-22',
    'review_note' => 'This document describes how the OryzenX platform works. It is provided as a baseline and should be reviewed by the operator\'s legal advisers.',
    'privacy' => [
        'title' => 'Privacy Policy',
        'sections' => [
            ['What this policy covers', 'This policy explains what personal information the OryzenX website, web app and Android app collect, why, how long it is kept and the choices you have.'],
            ['Information we collect', 'Account details you provide (name, email address, phone number, address where required); verification documents you choose to submit; payment details you add for salary payments; records entered by authorized administrators about your account (holdings, trades, transactions, loans, salary records); technical data needed to keep the service secure (IP address, device and browser type, sign-in history); and messages you send to support.'],
            ['How we use information', 'To provide and secure your account, verify your identity, calculate and display your portfolio information, send the notifications you have enabled and mandatory security notices, respond to support requests, and meet legal obligations. We do not sell personal information.'],
            ['Market data', 'Cryptocurrency prices are requested from third-party market data providers by our server. Your personal information is not sent to these providers.'],
            ['Notifications', 'Email is sent through the operator\'s configured email provider. Push notifications on Android use Google Firebase Cloud Messaging; notification text on the lock screen does not contain account amounts.'],
            ['Security', 'Data is transmitted over HTTPS. Passwords are stored as one-way hashes; payment details and document numbers are encrypted at rest. Access by staff is limited by role and logged.'],
            ['Retention', 'Account and financial records are kept while your account is active and afterwards for as long as required for accounting, audit and legal purposes. Sign-in records and technical logs are kept for a limited period.'],
            ['Your choices and rights', 'You can update your profile, change notification preferences, sign out other devices and request a copy or correction of your information through support. Optional emails can be turned off at any time in the app.'],
            ['Contact', 'Questions about privacy can be sent through the support form on the website or in the app.'],
        ],
    ],
    'terms' => [
        'title' => 'Terms of Service',
        'sections' => [
            ['The service', 'OryzenX is an investment monitoring platform. It displays information recorded for your account and values cryptocurrency holdings using third-party market prices. OryzenX does not execute trades, hold custody of assets through this app, or provide financial, legal or tax advice.'],
            ['Your account', 'You must provide accurate information, keep your password confidential and tell us promptly about any unauthorized use. One person may hold one account. We may require email and identity verification before showing account information.'],
            ['Accuracy of information', 'Market prices come from external providers and can be delayed, unavailable or inaccurate. The app shows the price source and update time and marks stale prices. Recorded balances and transactions are maintained by authorized administrators; if you believe a record is wrong, contact support.'],
            ['Acceptable use', 'Do not attempt to access other users\' information, interfere with the service, reverse-engineer security controls, or use automated tools to overload it.'],
            ['Suspension', 'We may suspend access to protect your account or the platform, or when these terms are breached. Where appropriate we will tell you why.'],
            ['Liability', 'The service is provided on an "as available" basis. To the extent permitted by law, the operator is not liable for losses arising from market movements, delays in third-party data or decisions you make based on the information shown.'],
            ['Changes', 'We may update these terms. Material changes will be announced in the app or by email before they take effect.'],
        ],
    ],
    'risk' => [
        'title' => 'Risk Disclosure',
        'sections' => [
            ['Volatility', 'Cryptocurrency prices can change rapidly and significantly. The value of holdings shown in OryzenX can fall as well as rise, and you could lose some or all of the value.'],
            ['Unrealized values are not cash', 'Unrealized profit is an estimate based on the current market price. It becomes realized only when a sale or closing trade is recorded. Unrealized gains are never treated as cash available for salary or withdrawal.'],
            ['Borrowed assets', 'Loans increase risk. A coin-denominated loan grows in USD terms when the coin\'s price rises. Borrowed assets are shown together with the matching liability and are not counted as your equity.'],
            ['Data limitations', 'Prices may be delayed or unavailable. When live data is not available the app shows the last valid price and labels it as stale.'],
            ['No guarantee', 'No return, profit or salary amount is guaranteed by market performance. Past performance does not indicate future results.'],
            ['Not advice', 'Information in OryzenX is for monitoring only and is not a recommendation to buy, sell or hold any asset.'],
        ],
    ],
];
