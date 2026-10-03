<?php
final class MaintenanceController
{
    public static function show(): never
    {
        $until = setting('maintenance_until');
        if (!$until || strtotime($until) < time()) $until = date('c', time() + max(1, (int)setting('maintenance_minutes')) * 60);
        http_response_code(503);
        header('Retry-After: ' . max(60, strtotime($until) - time()));
        if (is_json_request() && !is_spa()) json_out(['ok' => false, 'message' => sl('maintenance_message')], 503);
        if (is_spa()) json_out(['ok' => true, 'layout' => 'maintenance', 'html' => '-', 'url' => current_path_with_query()]);
        header('Content-Type: text/html; charset=utf-8');
        echo View::render('layouts/maintenance', ['until' => date('c', strtotime($until))]);
        exit;
    }
}
