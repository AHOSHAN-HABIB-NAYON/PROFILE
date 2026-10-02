<?php
/**
 * Optional cron endpoint (shared-hosting friendly):
 *   curl -s https://YOUR-DOMAIN.com/cron/<key>   every 5 minutes
 * The key is shown in Admin → Security.
 */
defined('APP') || exit;

function cron_key(): string
{
    return substr(hash_hmac('sha256', 'cron', (string)(ENV['app_key'] ?? '')), 0, 32);
}

function run_cron(string $key): void
{
    if (!hash_equals(cron_key(), $key)) render_error(404);
    @set_time_limit(120);
    $out = ['mail_sent' => process_mail_queue(50)];
    $retention = max(30, (int)setting('analytics.retention_days', 365));
    $out['rate_limits'] = q('DELETE FROM rate_limits WHERE reset_at < ?', [time()])->rowCount();
    $out['tokens'] = q('DELETE FROM email_tokens WHERE expires_at < NOW() - INTERVAL 7 DAY')->rowCount();
    $out['sessions'] = q('DELETE FROM user_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL 30 DAY) OR last_active < NOW() - INTERVAL ? DAY',
        [max(1, (int)setting('security.session_days', 30)) + 1])->rowCount();
    $out['page_views'] = q('DELETE FROM page_views WHERE created_at < NOW() - INTERVAL ? DAY', [$retention])->rowCount();
    $out['ai'] = q('DELETE FROM ai_conversations WHERE created_at < NOW() - INTERVAL 90 DAY')->rowCount();
    $out['mail_queue'] = q('DELETE FROM email_queue WHERE sent_at IS NOT NULL AND sent_at < NOW() - INTERVAL 14 DAY')->rowCount();
    // maintenance countdown finished → switch off automatically
    $ends = (string)setting('maintenance.ends_at');
    if (setting_bool('maintenance.enabled') && $ends !== '' && strtotime($ends) < time() - 3600) $out['maintenance'] = 'still enabled (countdown passed)';
    foreach (glob(ROOT . '/storage/cache/ai-knowledge-*.txt') ?: [] as $f) if (filemtime($f) < time() - 3600) @unlink($f);
    json_out(['ok' => true] + $out);
}
