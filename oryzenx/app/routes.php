<?php
/** @var Router $router */

// Installation
$router->get('/install', [InstallController::class, 'form']);
$router->post('/install', [InstallController::class, 'run']);

// Public pages
$router->get('/', [HomeController::class, 'index']);
$router->get('/faq', [HomeController::class, 'faq']);
$router->get('/search', [HomeController::class, 'search']);
$router->get('/api/search', [HomeController::class, 'apiSearch']);
$router->post('/lang/{code:bn|en}', [HomeController::class, 'lang']);
$router->post('/api/track', [HomeController::class, 'track']);
$router->get('/services', [ServiceController::class, 'index']);
$router->get('/services/{slug}', [ServiceController::class, 'show']);
$router->get('/news', [NewsController::class, 'index']);
$router->get('/news/{id:\d+}', [NewsController::class, 'show']);
$router->get('/news/{id:\d+}/{slug}', [NewsController::class, 'show']);
$router->get('/team', [TeamController::class, 'index']);
$router->get('/team/{id:\d+}', [TeamController::class, 'show']);
$router->get('/contact', [ContactController::class, 'index']);
$router->post('/contact', [ContactController::class, 'submit']);

// System
$router->get('/sitemap.xml', [SystemController::class, 'sitemap']);
$router->get('/robots.txt', [SystemController::class, 'robots']);
$router->get('/manifest.json', [SystemController::class, 'manifest']);
$router->get('/sw.js', [SystemController::class, 'serviceWorker']);
$router->get('/offline', [SystemController::class, 'offline']);
$router->get('/icon-{size:192|512}.png', [SystemController::class, 'icon']);
$router->get('/favicon.ico', [SystemController::class, 'favicon']);
$router->get('/files/{type:payment|contact}/{id:\d+}', [SystemController::class, 'privateFile'], ['auth']);

// Authentication
$router->get('/login', [AuthController::class, 'loginForm'], ['guest']);
$router->post('/login', [AuthController::class, 'login'], ['guest']);
$router->get('/login/verify', [AuthController::class, 'verifyForm']);
$router->post('/login/verify', [AuthController::class, 'verify']);
$router->post('/login/verify/resend', [AuthController::class, 'resendLoginCode']);
$router->get('/register', [AuthController::class, 'registerForm'], ['guest']);
$router->post('/register', [AuthController::class, 'register'], ['guest']);
$router->post('/logout', [AuthController::class, 'logout']);
$router->get('/forgot-password', [AuthController::class, 'forgotForm']);
$router->post('/forgot-password', [AuthController::class, 'forgot']);
$router->get('/reset-password/{token:[a-f0-9]{64}}', [AuthController::class, 'resetForm']);
$router->post('/reset-password', [AuthController::class, 'reset']);
$router->get('/verify-email/{token:[a-f0-9]{64}}', [AuthController::class, 'verifyEmail']);
$router->post('/verify-email/resend', [AuthController::class, 'resendVerification'], ['auth']);
$router->post('/recover-2fa', [AuthController::class, 'recover2faRequest']);
$router->get('/recover-2fa/{token:[a-f0-9]{64}}', [AuthController::class, 'recover2fa']);
$router->get('/auth/google', [GoogleController::class, 'redirect']);
$router->get('/auth/google/callback', [GoogleController::class, 'callback']);
$router->post('/api/passkey/login-options', [PasskeyController::class, 'loginOptions']);
$router->post('/api/passkey/login', [PasskeyController::class, 'login']);
$router->post('/api/passkey/register-options', [PasskeyController::class, 'registerOptions'], ['auth']);
$router->post('/api/passkey/register', [PasskeyController::class, 'register'], ['auth']);

// Account
$router->group('/profile', ['auth'], function (Router $r) {
    $r->get('', [ProfileController::class, 'overview']);
    $r->get('/edit', [ProfileController::class, 'edit']);
    $r->post('/edit', [ProfileController::class, 'update']);
    $r->post('/avatar', [ProfileController::class, 'avatar']);
    $r->get('/security', [ProfileController::class, 'security']);
    $r->post('/password', [ProfileController::class, 'password']);
    $r->post('/login-verify', [ProfileController::class, 'loginVerify']);
    $r->get('/2fa', [ProfileController::class, 'twoFactorSetup']);
    $r->post('/2fa/enable', [ProfileController::class, 'twoFactorEnable']);
    $r->post('/2fa/disable', [ProfileController::class, 'twoFactorDisable']);
    $r->post('/2fa/recovery', [ProfileController::class, 'twoFactorRecovery']);
    $r->post('/sessions/{id:\d+}/revoke', [ProfileController::class, 'revokeSession']);
    $r->post('/sessions/revoke-all', [ProfileController::class, 'revokeAll']);
    $r->post('/passkeys/{id:\d+}/delete', [ProfileController::class, 'deletePasskey']);
    $r->get('/payments', [ProfileController::class, 'payments']);
    $r->get('/payments/{id:\d+}', [ProfileController::class, 'payment']);
});

// Payment
$router->get('/payment', [PaymentController::class, 'index']);
$router->get('/payment/{slug}', [PaymentController::class, 'checkout'], ['auth']);
$router->post('/payment/{slug}', [PaymentController::class, 'submit'], ['auth']);

// Notifications
$router->get('/notifications', [NotificationController::class, 'index'], ['auth']);
$router->post('/notifications/read-all', [NotificationController::class, 'readAll'], ['auth']);
$router->get('/api/notifications', [NotificationController::class, 'api']);
$router->post('/api/push/subscribe', [NotificationController::class, 'subscribe']);
$router->post('/api/push/unsubscribe', [NotificationController::class, 'unsubscribe']);

// AI assistant
$router->get('/api/ai/history', [AiController::class, 'history']);
$router->post('/api/ai/chat', [AiController::class, 'chat']);
$router->post('/api/ai/clear', [AiController::class, 'clear']);

// Admin
$router->group('/admin', ['admin'], function (Router $r) {
    $r->get('', [AdminController::class, 'dashboard']);
    $r->get('/search', [AdminController::class, 'search']);
    $r->get('/analytics', [AdminController::class, 'analytics']);
    $r->get('/logs', [AdminController::class, 'logs']);
    $r->post('/logs/clear', [AdminController::class, 'clearLogs']);
    $r->get('/ai-logs', [AdminController::class, 'aiLogs']);

    $r->get('/users', [AdminUserController::class, 'index']);
    $r->get('/users/{id:\d+}', [AdminUserController::class, 'show']);
    $r->post('/users/{id:\d+}', [AdminUserController::class, 'update']);
    $r->post('/users/{id:\d+}/action', [AdminUserController::class, 'action']);

    $r->get('/payments', [AdminPaymentController::class, 'index']);
    $r->get('/payments/{id:\d+}', [AdminPaymentController::class, 'show']);
    $r->post('/payments/{id:\d+}', [AdminPaymentController::class, 'update']);

    $r->get('/messages', [AdminMessageController::class, 'index']);
    $r->get('/messages/{id:\d+}', [AdminMessageController::class, 'show']);
    $r->post('/messages/{id:\d+}', [AdminMessageController::class, 'reply']);

    $r->get('/notifications', [AdminNotificationController::class, 'index']);
    $r->post('/notifications', [AdminNotificationController::class, 'send']);
    $r->get('/api/users', [AdminNotificationController::class, 'userLookup']);

    $r->get('/settings', [AdminSettingsController::class, 'index']);
    $r->get('/settings/{section}', [AdminSettingsController::class, 'section']);
    $r->post('/settings/{section}', [AdminSettingsController::class, 'save']);
    $r->post('/settings-test/{what:smtp|ai}', [AdminSettingsController::class, 'test']);

    $r->get('/compressor', [AdminCompressorController::class, 'index']);
    $r->post('/compressor', [AdminCompressorController::class, 'compress']);

    // Definition-driven CRUD (services, posts, team, FAQ, slider, categories, payment methods)
    $entities = implode('|', array_keys(AdminCrudController::entities()));
    $r->get('/{entity:' . $entities . '}', [AdminCrudController::class, 'index']);
    $r->get('/{entity:' . $entities . '}/new', [AdminCrudController::class, 'form']);
    $r->get('/{entity:' . $entities . '}/{id:\d+}', [AdminCrudController::class, 'form']);
    $r->post('/{entity:' . $entities . '}/save', [AdminCrudController::class, 'save']);
    $r->post('/{entity:' . $entities . '}/{id:\d+}/delete', [AdminCrudController::class, 'delete']);
});
