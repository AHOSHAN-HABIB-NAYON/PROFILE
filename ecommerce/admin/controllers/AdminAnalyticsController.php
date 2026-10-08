<?php
/**
 * Analytics page (server-rendered for the selected range; charts are lightweight SVG).
 */
final class AdminAnalyticsController extends AdminController
{
    public function index(Request $r): Response
    {
        $range = (string)$r->get('range', '30d');
        [$from, $to] = Analytics::range($range, (string)$r->get('from', ''), (string)$r->get('to', ''));
        if (strtotime($to) < strtotime($from)) {
            [$from, $to] = [$to, $from];
        }
        if (strtotime($to) - strtotime($from) > 366 * 86400) {
            $from = date('Y-m-d', strtotime($to . ' -365 days'));
        }
        return $this->page('analytics', ['report' => Analytics::report($from, $to), 'range' => $range],
            ['title' => 'Analytics', 'nav' => 'analytics', 'page' => 'analytics', 'scripts' => ['charts']]);
    }
}
