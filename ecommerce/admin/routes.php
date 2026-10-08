<?php
/**
 * Admin routes. Everything except login/setup requires an authenticated admin;
 * every state-changing request requires the admin CSRF token; restricted areas
 * are additionally checked against the admin's role.
 * @var Router $router
 */

// Authentication (guests)
$router->get('/admin/login', [AdminAuthController::class, 'loginForm']);
$router->post('/admin/login', [AdminAuthController::class, 'login'], ['admin.csrf', 'throttle:adminlogin,20,900']);
$router->post('/admin/login/google', [AdminAuthController::class, 'google'], ['admin.csrf', 'throttle:admingoogle,20,900']);
$router->get('/admin/login/2fa', [AdminAuthController::class, 'twoFactorForm']);
$router->post('/admin/login/2fa', [AdminAuthController::class, 'twoFactor'], ['admin.csrf', 'throttle:admin2fa,10,900']);
$router->get('/admin/setup', [AdminAuthController::class, 'setupForm']);
$router->post('/admin/setup', [AdminAuthController::class, 'setup'], ['admin.csrf', 'throttle:adminsetup,10,900']);
$router->post('/admin/logout', [AdminAuthController::class, 'logout'], ['admin.csrf']);

$router->group('/admin', ['admin', 'admin.csrf'], static function (Router $r) {
    $r->get('', [AdminDashboardController::class, 'index']);
    $r->get('/poll', [AdminDashboardController::class, 'poll']);
    $r->get('/slug', [AdminDashboardController::class, 'slug']);

    // Products
    $r->get('/products', [AdminProductController::class, 'index']);
    $r->get('/products/create', [AdminProductController::class, 'form']);
    $r->get('/products/{id:\d+}/edit', [AdminProductController::class, 'form']);
    $r->get('/products/search', [AdminProductController::class, 'search']);
    $r->post('/products/save', [AdminProductController::class, 'save']);
    $r->post('/products/{id:\d+}/delete', [AdminProductController::class, 'delete']);
    $r->post('/products/{id:\d+}/stock', [AdminProductController::class, 'stock']);
    $r->post('/products/{id:\d+}/images', [AdminProductController::class, 'uploadImages']);
    $r->post('/products/images/{id:\d+}/delete', [AdminProductController::class, 'deleteImage']);
    $r->post('/products/{id:\d+}/images/reorder', [AdminProductController::class, 'reorderImages']);
    $r->post('/editor/upload', [AdminProductController::class, 'editorUpload']);

    // Categories, banners, coupons
    $r->get('/categories', [AdminCategoryController::class, 'index']);
    $r->post('/categories/save', [AdminCategoryController::class, 'save']);
    $r->post('/categories/{id:\d+}/delete', [AdminCategoryController::class, 'delete']);
    $r->get('/banners', [AdminBannerController::class, 'index']);
    $r->post('/banners/save', [AdminBannerController::class, 'save']);
    $r->post('/banners/{id:\d+}/delete', [AdminBannerController::class, 'delete']);
    $r->get('/coupons', [AdminCouponController::class, 'index']);
    $r->post('/coupons/save', [AdminCouponController::class, 'save']);
    $r->post('/coupons/{id:\d+}/delete', [AdminCouponController::class, 'delete']);

    // Orders & customers
    $r->get('/orders', [AdminOrderController::class, 'index']);
    $r->get('/orders/{id:\d+}', [AdminOrderController::class, 'show']);
    $r->get('/orders/{id:\d+}/print', [AdminOrderController::class, 'print']);
    $r->post('/orders/{id:\d+}/update', [AdminOrderController::class, 'update']);
    $r->post('/orders/{id:\d+}/status', [AdminOrderController::class, 'status']);
    $r->post('/orders/{id:\d+}/delete', [AdminOrderController::class, 'delete']);
    $r->post('/orders/bulk-status', [AdminOrderController::class, 'bulkStatus']);
    $r->get('/customers', [AdminCustomerController::class, 'index']);
    $r->get('/customers/{id:\d+}', [AdminCustomerController::class, 'show']);
    $r->post('/customers/{id:\d+}/block', [AdminCustomerController::class, 'toggleBlock']);

    // Delivery, courier, analytics, tracking, plugins
    $r->get('/delivery', [AdminDeliveryController::class, 'index'], ['role:delivery']);
    $r->post('/delivery', [AdminDeliveryController::class, 'save'], ['role:delivery']);
    $r->get('/courier', [AdminCourierController::class, 'index']);
    $r->get('/analytics', [AdminAnalyticsController::class, 'index'], ['role:analytics']);
    $r->get('/tracking', [AdminPluginController::class, 'tracking'], ['role:tracking']);
    $r->post('/tracking', [AdminPluginController::class, 'saveTracking'], ['role:tracking']);
    $r->get('/plugins', [AdminPluginController::class, 'index'], ['role:plugins']);
    $r->get('/plugins/{slug:[a-z_]+}', [AdminPluginController::class, 'show'], ['role:plugins']);
    $r->post('/plugins/{slug:[a-z_]+}', [AdminPluginController::class, 'save'], ['role:plugins']);
    $r->post('/plugins/{slug:[a-z_]+}/test', [AdminPluginController::class, 'test'], ['role:plugins']);

    // Settings & system
    $r->get('/settings', [AdminSettingsController::class, 'index'], ['role:settings']);
    $r->post('/settings', [AdminSettingsController::class, 'save'], ['role:settings']);
    $r->post('/settings/upload/{field:[a-z_]+}', [AdminSettingsController::class, 'upload'], ['role:settings']);
    $r->post('/settings/cache-clear', [AdminSettingsController::class, 'clearCache'], ['role:settings']);
    $r->get('/security', [AdminSecurityController::class, 'index'], ['role:security']);
    $r->post('/security/block', [AdminSecurityController::class, 'block'], ['role:security']);
    $r->post('/security/unblock/{id:\d+}', [AdminSecurityController::class, 'unblock'], ['role:security']);
    $r->post('/security/alerts/{id:\d+}/resolve', [AdminSecurityController::class, 'resolveAlert'], ['role:security']);
    $r->post('/security/duplicate', [AdminSecurityController::class, 'saveDuplicate'], ['role:security']);
    $r->post('/security/sessions/{id:\d+}/revoke', [AdminSecurityController::class, 'revokeSession'], ['role:security']);
    $r->post('/security/admins', [AdminSecurityController::class, 'saveAdmin'], ['role:security.admins']);
    $r->get('/account', [AdminSecurityController::class, 'account']);
    $r->post('/account/password', [AdminSecurityController::class, 'password']);
    $r->post('/account/2fa/setup', [AdminSecurityController::class, 'twoFactorSetup']);
    $r->post('/account/2fa/enable', [AdminSecurityController::class, 'twoFactorEnable']);
    $r->post('/account/2fa/disable', [AdminSecurityController::class, 'twoFactorDisable']);
    $r->get('/backup', [AdminBackupController::class, 'index'], ['role:backup']);
    $r->post('/backup/create', [AdminBackupController::class, 'create'], ['role:backup']);
    $r->post('/backup/restore', [AdminBackupController::class, 'restore'], ['role:backup']);
    $r->get('/backup/download/{name:[a-z0-9.-]+}', [AdminBackupController::class, 'download'], ['role:backup']);
    $r->post('/backup/delete/{name:[a-z0-9.-]+}', [AdminBackupController::class, 'delete'], ['role:backup']);
    $r->get('/notifications', [AdminNotificationController::class, 'index']);
    $r->post('/notifications/read-all', [AdminNotificationController::class, 'readAll']);
    $r->get('/trash', [AdminTrashController::class, 'index'], ['role:trash']);
    $r->post('/trash/{type:[a-z]+}/{id:\d+}/restore', [AdminTrashController::class, 'restore'], ['role:trash']);
    $r->post('/trash/{type:[a-z]+}/{id:\d+}/purge', [AdminTrashController::class, 'purge'], ['role:trash']);
    $r->get('/compressor', [AdminToolController::class, 'compressor'], ['role:compressor']);
    $r->post('/compressor', [AdminToolController::class, 'compress'], ['role:compressor']);
    $r->get('/compressor/download/{name:[a-z0-9.-]+}', [AdminToolController::class, 'download'], ['role:compressor']);
});
