<?php
/** @var Router $router  Admin panel (pages + JSON actions). All routes except login require an admin session. */
$router->get('/admin/login', [AdminAuthController::class, 'loginForm']);
$router->post('/admin/login', [AdminAuthController::class, 'login']);
$router->post('/admin/logout', [AdminAuthController::class, 'logout']);

$router->get('/admin', [AdminDashboardController::class, 'index']);
$router->get('/admin/api/notifications/count', [AdminSystemController::class, 'notificationCount']);

// Orders
$router->get('/admin/orders', [AdminOrderController::class, 'index']);
$router->get('/admin/orders/{id}', [AdminOrderController::class, 'show']);
$router->post('/admin/api/orders/{id}/status', [AdminOrderController::class, 'status']);
$router->post('/admin/api/orders/{id}/update', [AdminOrderController::class, 'update']);
$router->post('/admin/api/orders/{id}/courier', [AdminOrderController::class, 'sendCourier']);
$router->post('/admin/api/orders/{id}/geo', [AdminOrderController::class, 'geo']);
$router->post('/admin/api/orders/{id}/fraud', [AdminOrderController::class, 'fraud']);
$router->post('/admin/api/orders/{id}/trash', [AdminOrderController::class, 'trash']);
$router->post('/admin/api/courier-orders/{id}/sync', [AdminOrderController::class, 'syncCourier']);
$router->post('/admin/api/orders/{id}/block-ip', [AdminOrderController::class, 'blockIp']);

// Products & stock
$router->get('/admin/products', [AdminProductController::class, 'index']);
$router->get('/admin/products/create', [AdminProductController::class, 'form']);
$router->get('/admin/products/{id}/edit', [AdminProductController::class, 'form']);
$router->post('/admin/api/products/save', [AdminProductController::class, 'save']);
$router->post('/admin/api/products/{id}/images', [AdminProductController::class, 'uploadImages']);
$router->post('/admin/api/products/{id}/images/order', [AdminProductController::class, 'reorderImages']);
$router->post('/admin/api/product-images/{id}/delete', [AdminProductController::class, 'deleteImage']);
$router->post('/admin/api/product-images/{id}/replace', [AdminProductController::class, 'replaceImage']);
$router->post('/admin/api/products/{id}/toggle', [AdminProductController::class, 'toggle']);
$router->post('/admin/api/products/{id}/trash', [AdminProductController::class, 'trash']);
$router->get('/admin/api/products/search', [AdminProductController::class, 'search']);
$router->post('/admin/api/editor/upload', [AdminProductController::class, 'editorUpload']);
$router->get('/admin/stock', [AdminProductController::class, 'stock']);
$router->post('/admin/api/stock/{id}', [AdminProductController::class, 'adjustStock']);
$router->get('/admin/flash-sale', [AdminProductController::class, 'flash']);
$router->post('/admin/api/flash/{id}', [AdminProductController::class, 'saveFlash']);

// Catalog modules
$router->get('/admin/categories', [AdminCatalogController::class, 'categories']);
$router->post('/admin/api/categories/save', [AdminCatalogController::class, 'saveCategory']);
$router->get('/admin/combos', [AdminCatalogController::class, 'combos']);
$router->post('/admin/api/combos/save', [AdminCatalogController::class, 'saveCombo']);
$router->get('/admin/banners', [AdminCatalogController::class, 'banners']);
$router->post('/admin/api/banners/save', [AdminCatalogController::class, 'saveBanner']);
$router->get('/admin/coupons', [AdminCatalogController::class, 'coupons']);
$router->post('/admin/api/coupons/save', [AdminCatalogController::class, 'saveCoupon']);
$router->post('/admin/api/{entity}/{id}/toggle', [AdminCatalogController::class, 'toggle']);
$router->post('/admin/api/{entity}/{id}/trash', [AdminCatalogController::class, 'trash']);
$router->post('/admin/api/{entity}/sort', [AdminCatalogController::class, 'sort']);

// Courier, fraud, IP protection
$router->get('/admin/couriers', [AdminCourierController::class, 'index']);
$router->post('/admin/api/couriers/{code}/save', [AdminCourierController::class, 'save']);
$router->post('/admin/api/couriers/{code}/test', [AdminCourierController::class, 'test']);
$router->get('/admin/fraud', [AdminCourierController::class, 'fraud']);
$router->post('/admin/api/fraud/check', [AdminCourierController::class, 'fraudCheck']);
$router->get('/admin/blocked-ips', [AdminCourierController::class, 'blocked']);
$router->post('/admin/api/blocked-ips/add', [AdminCourierController::class, 'block']);
$router->post('/admin/api/blocked-ips/{id}/unblock', [AdminCourierController::class, 'unblock']);

// Analytics & system
$router->get('/admin/analytics', [AdminAnalyticsController::class, 'index']);
$router->get('/admin/notifications', [AdminSystemController::class, 'notifications']);
$router->post('/admin/api/notifications/read', [AdminSystemController::class, 'markRead']);
$router->get('/admin/trash', [AdminSystemController::class, 'trash']);
$router->post('/admin/api/trash/{id}/restore', [AdminSystemController::class, 'restore']);
$router->post('/admin/api/trash/{id}/purge', [AdminSystemController::class, 'purge']);
$router->get('/admin/settings', [AdminSystemController::class, 'settings']);
$router->post('/admin/api/settings/save', [AdminSystemController::class, 'saveSettings']);
$router->post('/admin/api/settings/meta-test', [AdminSystemController::class, 'metaTest']);
$router->post('/admin/api/settings/password', [AdminSystemController::class, 'password']);
$router->post('/admin/api/settings/seo', [AdminSystemController::class, 'saveSeo']);
$router->post('/admin/api/cache/clear', [AdminSystemController::class, 'clearCache']);
