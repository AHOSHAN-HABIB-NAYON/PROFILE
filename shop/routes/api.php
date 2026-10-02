<?php
/** @var Router $router  JSON endpoints used by the Fetch API front-end. */
$router->get('/api/cart', [CartApi::class, 'get']);
$router->post('/api/cart/add', [CartApi::class, 'add']);
$router->post('/api/cart/update', [CartApi::class, 'update']);
$router->post('/api/cart/remove', [CartApi::class, 'remove']);
$router->post('/api/cart/coupon', [CartApi::class, 'coupon']);
$router->get('/api/checkout/quote', [CheckoutApi::class, 'quote']);
$router->post('/api/checkout', [CheckoutApi::class, 'place']);
$router->get('/api/customer-lookup', [CheckoutApi::class, 'lookup']);
$router->get('/api/search', [CatalogApi::class, 'search']);
$router->post('/api/track', [CatalogApi::class, 'track']);
$router->get('/api/csrf', static fn () => Response::ok());
