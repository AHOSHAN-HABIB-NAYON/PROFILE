<?php
/**
 * Storefront routes (clean URLs, server-rendered + SPA partials).
 * @var Router $router
 */

$router->get('/', [HomeController::class, 'index']);
$router->get('/products', [ProductController::class, 'index']);
$router->get('/product/{slug}', [ProductController::class, 'show']);
$router->get('/categories', [CategoryController::class, 'index']);
$router->get('/category/{slug}', [CategoryController::class, 'show']);
$router->get('/search', [SearchController::class, 'index']);
$router->get('/cart', [CartController::class, 'index']);
$router->get('/checkout', [CheckoutController::class, 'index']);
$router->get('/order/success/{code:[A-Za-z0-9]+}', [OrderController::class, 'success']);
$router->get('/orders', [OrderController::class, 'index']);
$router->get('/profile', [PageController::class, 'profile']);
$router->get('/page/{slug}', [PageController::class, 'show']);
$router->get('/offline', [PageController::class, 'offline']);

$router->get('/sitemap.xml', [SeoController::class, 'sitemap']);
$router->get('/robots.txt', [SeoController::class, 'robots']);
$router->get('/manifest.json', [SeoController::class, 'manifest']);
