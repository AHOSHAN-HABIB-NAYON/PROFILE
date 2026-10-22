<?php
declare(strict_types=1);

// Front controller. Point the web server document root at /public.
require dirname(__DIR__) . '/app/bootstrap.php';

use OryzenX\Core\App;
use OryzenX\Core\Request;

App::handle(Request::fromGlobals())->send();
