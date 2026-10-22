<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api\Admin;

use OryzenX\Controllers\Controller;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Services\AuditService;
use OryzenX\Services\ContentService;
use OryzenX\Services\SchedulerService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\SystemService;

/** Settings (general, branding, language, integrations), content, audit logs, health and backups. */
final class SystemController extends Controller
{
    /** Settings an admin may edit, grouped by the permission required. */
    private const GENERAL = ['site_name', 'support_email', 'support_phone', 'support_hours', 'business_timezone', 'registration_open',
        'require_identity_verification', 'brand_primary', 'default_locale', 'enabled_locales', 'play_store_url', 'apk_download_url', 'android_package', 'android_sha256',
        'reminder_enabled', 'reminder_interval_days', 'reminder_subject_en', 'reminder_subject_bn', 'reminder_body_en', 'reminder_body_bn'];
    private const INTEGRATIONS = ['smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_encryption', 'smtp_username', 'smtp_password', 'smtp_from_email', 'smtp_from_name',
        'smtp_reply_to', 'smtp_timeout', 'market_provider', 'market_api_key', 'market_api_plan', 'market_poll_seconds', 'market_stale_seconds',
        'google_client_ids', 'fcm_enabled', 'fcm_project_id', 'fcm_service_account'];

    public function __construct(
        private SettingsService $settings,
        private ContentService $content,
        private AuditService $audit,
        private SystemService $system,
        private SchedulerService $scheduler
    ) {
    }

    public function settings(Request $req): Response
    {
        return Response::ok([
            'values' => $this->settings->forAdmin(),
            'general_keys' => self::GENERAL,
            'integration_keys' => self::INTEGRATIONS,
            'timezones' => \DateTimeZone::listIdentifiers(),
        ]);
    }

    public function saveGeneral(Request $req): Response
    {
        return $this->save($req, self::GENERAL);
    }

    public function saveIntegrations(Request $req): Response
    {
        return $this->save($req, self::INTEGRATIONS);
    }

    private function save(Request $req, array $allowed): Response
    {
        $input = $req->input('values', []);
        if (!is_array($input)) {
            throw HttpException::validation(['values' => 'Invalid settings payload.']);
        }
        $errors = [];
        $changed = [];
        foreach ($input as $key => $value) {
            if (!in_array($key, $allowed, true)) {
                continue;
            }
            $value = is_bool($value) ? ($value ? '1' : '0') : (is_scalar($value) ? trim((string) $value) : null);
            if ($value === null) {
                continue;
            }
            // secrets: an empty submission keeps the stored value; the literal "__clear__" removes it
            if (in_array($key, SettingsService::SECRET_KEYS, true)) {
                if ($value === '') {
                    continue;
                }
                if ($value === '__clear__') {
                    $value = '';
                }
            }
            $err = $this->validateSetting($key, $value);
            if ($err) {
                $errors[$key] = $err;
                continue;
            }
            $this->settings->set($key, $value, $this->uid($req));
            $changed[] = $key;
        }
        if ($errors) {
            throw \OryzenX\Core\HttpException::validation($errors);
        }
        $this->audit->log($this->uid($req), 'settings.updated', 'settings', null, ['keys' => $changed]);
        return Response::ok(['saved' => $changed, 'values' => $this->settings->forAdmin()]);
    }

    private function validateSetting(string $key, string $v): ?string
    {
        return match ($key) {
            'support_email', 'smtp_from_email', 'smtp_reply_to' => $v === '' || filter_var($v, FILTER_VALIDATE_EMAIL) ? null : 'Enter a valid email address.',
            'business_timezone' => in_array($v, \DateTimeZone::listIdentifiers(), true) ? null : 'Select a valid timezone.',
            'smtp_port' => ctype_digit($v) && (int) $v > 0 && (int) $v < 65536 ? null : 'Enter a valid port.',
            'smtp_encryption' => in_array($v, ['tls', 'ssl', 'none'], true) ? null : 'Choose TLS, SSL or none.',
            'smtp_timeout' => ctype_digit($v) && (int) $v >= 5 && (int) $v <= 120 ? null : 'Use 5–120 seconds.',
            'market_provider' => in_array($v, array_column(\OryzenX\Services\MarketService::availableProviders(), 'id'), true) ? null : 'Select a provider.',
            'market_api_plan' => in_array($v, ['demo', 'pro'], true) ? null : 'Choose demo or pro.',
            'market_poll_seconds' => ctype_digit($v) && (int) $v >= 30 && (int) $v <= 3600 ? null : 'Use 30–3600 seconds (respect provider rate limits).',
            'market_stale_seconds' => ctype_digit($v) && (int) $v >= 60 && (int) $v <= 86400 ? null : 'Use 60–86400 seconds.',
            'reminder_interval_days' => ctype_digit($v) && (int) $v >= 1 && (int) $v <= 90 ? null : 'Use 1–90 days.',
            'brand_primary' => preg_match('/^#[0-9A-Fa-f]{6}$/', $v) ? null : 'Use a hex colour like #1A56DB.',
            'default_locale' => in_array($v, ['en', 'bn'], true) ? null : 'Choose English or Bangla.',
            'play_store_url', 'apk_download_url' => $v === '' || (filter_var($v, FILTER_VALIDATE_URL) && str_starts_with($v, 'https://')) ? null : 'Enter an https:// URL.',
            'fcm_service_account' => $v === '' || (is_array($j = json_decode($v, true)) && !empty($j['client_email']) && !empty($j['private_key'])) ? null : 'Paste the full service-account JSON downloaded from Firebase.',
            'android_sha256' => $v === '' || preg_match('/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/', $v) ? null : 'Use the SHA-256 fingerprint format AA:BB:...',
            'registration_open', 'require_identity_verification', 'smtp_enabled', 'fcm_enabled', 'reminder_enabled' => in_array($v, ['0', '1'], true) ? null : 'Invalid value.',
            default => mb_strlen($v) > 5000 ? 'Too long.' : null,
        };
    }

    // ---- content & translations
    public function landingContent(Request $req): Response
    {
        return Response::ok($this->content->landingForAdmin());
    }

    public function saveLandingContent(Request $req): Response
    {
        $items = $req->input('items', []);
        foreach (is_array($items) ? $items : [] as $it) {
            $this->content->saveLanding((string) ($it['locale'] ?? ''), (string) ($it['key'] ?? ''), isset($it['value']) ? (string) $it['value'] : null, $this->uid($req));
        }
        return Response::ok($this->content->landingForAdmin());
    }

    public function translations(Request $req): Response
    {
        return Response::ok($this->content->translationsForAdmin($req->str('q'), $req->bool('missing')));
    }

    public function saveTranslations(Request $req): Response
    {
        $items = $req->input('items', []);
        foreach (is_array($items) ? $items : [] as $it) {
            $this->content->saveTranslation((string) ($it['locale'] ?? ''), (string) ($it['key'] ?? ''), isset($it['value']) ? (string) $it['value'] : null, $this->uid($req));
        }
        return Response::ok(['saved' => true]);
    }

    // ---- audit, health, scheduler, backups
    public function audit(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 30);
        [$rows, $total] = $this->audit->list($this->filters($req, ['action', 'actor_id', 'entity_type', 'from', 'to']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function securityEvents(Request $req): Response
    {
        $db = \OryzenX\Core\App::get(\OryzenX\Core\Database::class);
        [$page, $per] = $this->paging($req, 30);
        $where = $req->bool('failed_only') ? 'WHERE lh.success = 0 OR lh.suspicious = 1' : '';
        $total = (int) $db->value("SELECT COUNT(*) FROM login_history lh $where");
        $rows = $db->all("SELECT lh.*, u.full_name FROM login_history lh LEFT JOIN users u ON u.id = lh.user_id $where ORDER BY lh.id DESC LIMIT :l OFFSET :o", ['l' => $per, 'o' => ($page - 1) * $per]);
        return $this->paged($rows, $total, $page, $per);
    }

    public function health(Request $req): Response
    {
        return Response::ok($this->system->health() + ['tasks' => $this->scheduler->recentLogs(30)]);
    }

    public function runTask(Request $req): Response
    {
        $task = $req->str('task');
        if (!in_array($task, ['market_refresh', 'email_queue', 'portfolio_snapshots', 'portfolio_threshold', 'reminders', 'salary_records', 'cleanup'], true)) {
            throw HttpException::validation(['task' => 'Unknown task.']);
        }
        $this->audit->log($this->uid($req), 'system.task_run', 'task', $task);
        return Response::ok($this->scheduler->run($task));
    }

    public function backups(Request $req): Response
    {
        return Response::ok($this->system->backups());
    }

    public function createBackup(Request $req): Response
    {
        return Response::ok($this->system->backup($this->uid($req)));
    }

    public function downloadBackup(Request $req): Response
    {
        $p = $this->system->backupPath((string) ($req->params['file'] ?? ''));
        if (!$p) {
            throw HttpException::notFound();
        }
        $this->audit->log($this->uid($req), 'system.backup_downloaded', 'backup', basename($p));
        return $this->file($p, 'application/gzip', basename($p));
    }

    public function deleteBackup(Request $req): Response
    {
        $this->system->deleteBackup((string) ($req->params['file'] ?? ''), $this->uid($req));
        return Response::ok($this->system->backups());
    }
}
