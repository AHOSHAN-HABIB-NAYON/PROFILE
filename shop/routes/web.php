<?php
/** @var Router $router */
$router->get('/', [HomeController::class, 'index']);
$router->get('/products', [ProductController::class, 'index']);
$router->get('/product/{slug}', [ProductController::class, 'show']);
$router->get('/categories', [CategoryController::class, 'index']);
$router->get('/category/{slug}', [CategoryController::class, 'show']);
$router->get('/cart', [CartController::class, 'show']);
$router->get('/checkout', [CheckoutController::class, 'show']);
$router->get('/order-success/{code}', [CheckoutController::class, 'success']);
$router->get('/my-orders', [CheckoutController::class, 'myOrders']);
$router->get('/contact', [PageController::class, 'contact']);
$router->get('/offline', [PageController::class, 'offline']);

// System files (dynamic, admin-controlled)
$router->get('/manifest.json', [SystemController::class, 'manifest']);
$router->get('/sw.js', [SystemController::class, 'serviceWorker']);
$router->get('/robots.txt', [SystemController::class, 'robots']);
$router->get('/sitemap.xml', [SystemController::class, 'sitemap']);
