<?php
/**
 * Analytics API: whitelisted client events (public) and the admin report.
 */
final class AnalyticsApi
{
    private const CLIENT_EVENTS = ['whatsapp_click', 'pwa_install', 'share', 'search_suggest_click'];

    public function event(Request $r): Response
    {
        $name = $r->str('name', 40);
        if (!in_array($name, self::CLIENT_EVENTS, true)) {
            return Response::error('Unknown event', 422);
        }
        Analytics::record($name, 1);
        return Response::success('OK');
    }

    public function report(Request $r): Response
    {
        [$from, $to] = Analytics::range((string)$r->get('range', '30d'), (string)$r->get('from', ''), (string)$r->get('to', ''));
        if (strtotime($to) - strtotime($from) > 366 * 86400) {
            return Response::error('Maximum range is one year.', 422);
        }
        return Response::success('OK', Analytics::report($from, $to));
    }
}
