<?php
/**
 * JSON API routes. Every response uses {success, message, data}.
 * Public endpoints: signed double-submit CSRF + rate limits.
 * Admin endpoints (/api/admin/*): admin session + CSRF + role checks.
 * @var Router $router
 */

require __DIR__ . '/products.php';
require __DIR__ . '/cart.php';
require __DIR__ . '/checkout.php';
require __DIR__ . '/orders.php';
require __DIR__ . '/analytics.php';
require __DIR__ . '/courier.php';

// Public
$router->get('/api/search', [ProductsApi::class, 'search'], ['throttle:search,90,60']);
$router->get('/api/products/{id:\d+}/related', [ProductsApi::class, 'related'], ['throttle:related,90,60']);
$router->post('/api/cart/add', [CartApi::class, 'add'], ['csrf.public', 'throttle:cart,60,60']);
$router->post('/api/cart/price', [CartApi::class, 'price'], ['csrf.public', 'throttle:cartprice,90,60']);
$router->post('/api/checkout/lookup', [CheckoutApi::class, 'lookup'], ['csrf.public', 'throttle:lookup,20,600']);
$router->post('/api/checkout/place', [CheckoutApi::class, 'place'], ['csrf.public']);
$router->post('/api/orders/track', [OrdersApi::class, 'track'], ['csrf.public', 'throttle:track,20,600']);
$router->post('/api/analytics/event', [AnalyticsApi::class, 'event'], ['csrf.public', 'throttle:event,60,60']);

// Admin
$router->group('/api/admin', ['admin', 'admin.csrf'], static function (Router $r) {
    $r->get('/analytics', [AnalyticsApi::class, 'report'], ['role:analytics']);
    $r->post('/orders/{id:\d+}/geo', [OrdersApi::class, 'geo']);
    $r->post('/courier/send/{id:\d+}', [CourierApi::class, 'send']);
    $r->post('/courier/sync/{id:\d+}', [CourierApi::class, 'sync']);
    $r->post('/courier/sync-all', [CourierApi::class, 'syncAll']);
    $r->post('/courier/fraud/{id:\d+}', [CourierApi::class, 'fraud']);
    $r->post('/courier/test/{slug:[a-z]+}', [CourierApi::class, 'test'], ['role:plugins']);
    $r->post('/courier/balance/{slug:[a-z]+}', [CourierApi::class, 'balance']);
});
