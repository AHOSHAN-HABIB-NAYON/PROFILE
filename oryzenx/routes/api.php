<?php
// User-facing JSON API (web apps + Android). All responses: {ok, data, meta?} or {ok:false, error:{code,message,fields?}}.
use OryzenX\Controllers\Api\AccountController as A;
use OryzenX\Controllers\Api\AuthController as Auth;
use OryzenX\Controllers\Api\FinanceController as F;
use OryzenX\Controllers\Web\PublicController as P;

$auth = ['auth' => true];
$verified = ['auth' => true, 'verified' => true];

$r->get('/api/app/config', [P::class, 'appConfig']);
$r->get('/api/i18n/{locale:en|bn}', [P::class, 'strings']);
$r->post('/api/support', [P::class, 'supportSubmit']);

$r->post('/api/auth/register', [Auth::class, 'register']);
$r->post('/api/auth/login', [Auth::class, 'login']);
$r->post('/api/auth/google', [Auth::class, 'google']);
$r->post('/api/auth/forgot-password', [Auth::class, 'forgot']);
$r->post('/api/auth/reset-password', [Auth::class, 'reset']);
$r->post('/api/auth/logout', [Auth::class, 'logout'], $auth);
$r->post('/api/auth/verify-email', [Auth::class, 'verifyCode'], $auth);
$r->post('/api/auth/resend-verification', [Auth::class, 'resendVerification'], $auth);
$r->post('/api/auth/reauth', [Auth::class, 'reauth'], $auth);
$r->get('/api/me', [Auth::class, 'me'], $auth);

$r->get('/api/me/profile', [A::class, 'profile'], $auth);
$r->put('/api/me/profile', [A::class, 'updateProfile'], $auth);
$r->put('/api/me/preferences', [A::class, 'preferences'], $auth);
$r->post('/api/me/avatar', [A::class, 'uploadAvatar'], $auth);
$r->get('/api/me/avatar', [A::class, 'avatar'], $auth);
$r->post('/api/me/password', [A::class, 'changePassword'], $auth);
$r->get('/api/me/sessions', [A::class, 'sessions'], $auth);
$r->delete('/api/me/sessions/{id:\d+}', [A::class, 'revokeSession'], $auth);
$r->post('/api/me/sessions/revoke-others', [A::class, 'revokeOthers'], $auth);
$r->get('/api/me/notification-preferences', [A::class, 'notificationPrefs'], $auth);
$r->put('/api/me/notification-preferences', [A::class, 'updateNotificationPrefs'], $auth);
$r->get('/api/notifications', [A::class, 'notifications'], $auth);
$r->post('/api/notifications/read', [A::class, 'markRead'], $auth);
$r->post('/api/push-tokens', [A::class, 'registerPush'], $auth);
$r->post('/api/push-tokens/remove', [A::class, 'unregisterPush'], $auth);
$r->get('/api/verification', [A::class, 'verificationStatus'], $auth);
$r->post('/api/verification', [A::class, 'submitVerification'], $verified);
$r->post('/api/support/app', [A::class, 'support'], $auth);

// Financial data: requires a verified email; always scoped to the signed-in user
$r->get('/api/dashboard', [F::class, 'dashboard'], $verified);
$r->get('/api/portfolio', [F::class, 'portfolio'], $verified);
$r->get('/api/assets', [F::class, 'assets'], $verified);
$r->get('/api/assets/{id:\d+}', [F::class, 'asset'], $verified);
$r->get('/api/assets/{id:\d+}/ohlc', [F::class, 'ohlc'], $verified);
$r->get('/api/trading/monitor', [F::class, 'tradingMonitor'], $verified);
$r->get('/api/trades', [F::class, 'trades'], $verified);
$r->get('/api/trades/{id:\d+}', [F::class, 'trade'], $verified);
$r->get('/api/transactions', [F::class, 'transactions'], $verified);
$r->get('/api/transactions/export', [F::class, 'exportTransactions'], $verified);
$r->get('/api/transactions/{id:\d+}', [F::class, 'transaction'], $verified);
$r->get('/api/loans', [F::class, 'loans'], $verified);
$r->get('/api/loans/{id:\d+}', [F::class, 'loan'], $verified);
$r->get('/api/salary', [F::class, 'salary'], $verified);
$r->get('/api/payment-methods', [F::class, 'paymentMethods'], $verified);
$r->get('/api/payment-details', [F::class, 'paymentDetails'], $verified);
$r->post('/api/payment-details', [F::class, 'savePaymentDetails'], $verified);
$r->post('/api/payment-details/{id:\d+}/primary', [F::class, 'primaryPaymentDetails'], $verified);
$r->delete('/api/payment-details/{id:\d+}', [F::class, 'deletePaymentDetails'], $verified);
