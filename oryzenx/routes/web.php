<?php
// Public website + app shells. $r is OryzenX\Core\Router.
use OryzenX\Controllers\Web\InstallController;
use OryzenX\Controllers\Web\PublicController as P;

$r->get('/', [P::class, 'landing']);
$r->get('/{page:privacy|terms|risk}', [P::class, 'legal']);
$r->get('/robots.txt', [P::class, 'robots']);
$r->get('/sitemap.xml', [P::class, 'sitemap']);
$r->get('/.well-known/assetlinks.json', [P::class, 'assetLinks']);
$r->get('/health', [P::class, 'health']);
$r->get('/api/public/markets', [P::class, 'markets']);
$r->get('/verify-email', [P::class, 'verifyEmail']);
$r->get('/reset-password', [P::class, 'resetPassword']);

// User App (SPA) and Admin App (SPA, restricted entry route; every API call is authorised server-side)
$r->get('/app', [P::class, 'userApp']);
$r->get('/app/{any:.*}', [P::class, 'userApp']);
$r->get('/v2admin', [P::class, 'adminApp']);
$r->get('/v2admin/{any:.*}', [P::class, 'adminApp']);

// Installer (locks itself after a successful install)
$r->get('/install', [InstallController::class, 'show']);
$r->post('/install/test-db', [InstallController::class, 'testDb']);
$r->post('/install/run', [InstallController::class, 'run']);
