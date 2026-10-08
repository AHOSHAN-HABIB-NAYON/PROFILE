<?php
/**
 * Plugin marketplace-style settings: tracking (Meta Pixel, CAPI, GTM, Google Ads),
 * fraud check, WhatsApp and courier plugins. Secrets are write-only.
 */
final class AdminPluginController extends AdminController
{
    public function index(Request $r): Response
    {
        $cards = [];
        foreach (PluginManager::DEFINITIONS as $slug => $def) {
            $cfg = PluginManager::config($slug);
            $configured = $def['fields'] === [] || count(array_filter($cfg, static fn($v) => $v !== '')) > 0;
            $cards[] = ['slug' => $slug, 'name' => $def['name'], 'icon' => $def['icon'], 'category' => $def['category'], 'description' => $def['description'],
                'features' => $def['features'], 'enabled' => PluginManager::enabled($slug), 'connected' => $configured, 'link' => $def['settings_link'] ?? null];
        }
        foreach (CourierManager::all() as $slug => $p) {
            $row = CourierManager::row($slug);
            $cards[] = ['slug' => $slug, 'name' => $p->name(), 'icon' => $p->icon(), 'category' => 'courier', 'description' => $p->description(),
                'features' => array_map('ucfirst', $p->capabilities()), 'enabled' => (int)$row['is_enabled'] === 1, 'connected' => (int)$row['connected'] === 1, 'link' => null];
        }
        return $this->page('plugins', ['cards' => $cards], ['title' => 'Plugins', 'nav' => 'plugins', 'page' => 'plugins']);
    }

    public function show(Request $r, string $slug): Response
    {
        if (isset(CourierManager::CLASSES[$slug])) {
            $p = CourierManager::make($slug);
            $row = CourierManager::row($slug);
            $saved = Crypto::decryptArray($row['credentials']);
            return $this->page('plugin', [
                'type' => 'courier', 'slug' => $slug, 'name' => $p->name(), 'icon' => $p->icon(), 'description' => $p->description(),
                'features' => $p->capabilities(), 'enabled' => (int)$row['is_enabled'] === 1, 'isDefault' => (int)$row['is_default'] === 1,
                'credentialFields' => $p->credentialFields(), 'savedCreds' => array_map(static fn($v) => $v !== '', $saved),
                'settingFields' => $p->settingFields(), 'settings' => json_list($row['settings']), 'row' => $row,
            ], ['title' => $p->name(), 'nav' => 'plugins', 'page' => 'plugin']);
        }
        $def = PluginManager::DEFINITIONS[$slug] ?? throw new HttpException(404);
        if (!empty($def['settings_link'])) {
            return Response::redirect(url($def['settings_link']));
        }
        return $this->page('plugin', [
            'type' => 'plugin', 'slug' => $slug, 'name' => $def['name'], 'icon' => $def['icon'], 'description' => $def['description'],
            'features' => $def['features'], 'enabled' => PluginManager::enabled($slug), 'fields' => $def['fields'], 'values' => PluginManager::formValues($slug),
        ], ['title' => $def['name'], 'nav' => 'plugins', 'page' => 'plugin']);
    }

    public function save(Request $r, string $slug): Response
    {
        if (isset(CourierManager::CLASSES[$slug])) {
            CourierManager::saveConfig($slug, $r->bool('enabled'), $r->bool('is_default'), (array)$r->input('cred', []), (array)$r->input('opt', []));
            return $this->done('Courier settings saved. Use “Test connection” to verify.');
        }
        if (!isset(PluginManager::DEFINITIONS[$slug])) {
            return $this->fail('Unknown plugin.', 404);
        }
        $input = (array)$r->input('cfg', []);
        foreach (PluginManager::DEFINITIONS[$slug]['fields'] as $key => $field) {
            if (($field['type'] ?? '') === 'toggle') {
                $input[$key] = !empty($input[$key]) ? '1' : '0';
            }
        }
        $error = $this->validatePlugin($slug, $input);
        if ($error) {
            return $this->fail($error);
        }
        PluginManager::save($slug, $r->bool('enabled'), $input);
        return $this->done('Plugin saved.');
    }

    public function test(Request $r, string $slug): Response
    {
        if ($slug === 'meta_capi' || $slug === 'meta_pixel') {
            $res = Tracking::testConnection();
            return $res['ok'] ? $this->done($res['message'], []) : $this->fail($res['message']);
        }
        if (isset(CourierManager::CLASSES[$slug])) {
            $res = CourierManager::test($slug);
            return $res->ok ? $this->done($res->message) : $this->fail($res->message);
        }
        return $this->fail('This plugin has no connection test.');
    }

    /** Pixel & Tracking page: per-event browser/server toggles + quick status. */
    public function tracking(Request $r): Response
    {
        $rows = DB::all('SELECT * FROM tracking_settings ORDER BY provider, id');
        return $this->page('tracking', [
            'rows' => $rows,
            'status' => [
                'meta_pixel' => PluginManager::enabled('meta_pixel') && Tracking::pixelId() !== '',
                'meta_capi' => PluginManager::enabled('meta_capi') && (PluginManager::config('meta_capi')['access_token'] ?? '') !== '',
                'google_tag' => Tracking::browserConfig()['gtm'] !== '',
                'google_ads' => Tracking::browserConfig()['ads_id'] !== '',
            ],
        ], ['title' => 'Pixel & Tracking', 'nav' => 'tracking', 'page' => 'tracking']);
    }

    public function saveTracking(Request $r): Response
    {
        $browser = (array)$r->input('browser', []);
        $server = (array)$r->input('server', []);
        foreach (DB::all('SELECT id FROM tracking_settings') as $row) {
            DB::exec('UPDATE tracking_settings SET browser_enabled = ?, server_enabled = ? WHERE id = ?', [
                isset($browser[$row['id']]) ? 1 : 0, isset($server[$row['id']]) ? 1 : 0, $row['id'],
            ]);
        }
        Cache::forget('settings:tracking');
        Audit::log('tracking.update');
        return $this->done('Tracking events saved.');
    }

    private function validatePlugin(string $slug, array $in): ?string
    {
        return match ($slug) {
            'meta_pixel' => ($in['pixel_id'] ?? '') !== '' && !preg_match('/^\d{5,20}$/', $in['pixel_id']) ? 'Pixel ID must be numeric.' : null,
            'google_tag' => ($in['gtm_id'] ?? '') !== '' && !preg_match('/^GTM-[A-Z0-9]{4,12}$/', $in['gtm_id']) ? 'GTM ID looks like GTM-XXXXXXX.' : null,
            'google_ads' => ($in['conversion_id'] ?? '') !== '' && !preg_match('/^AW-\d{5,15}$/', $in['conversion_id']) ? 'Conversion ID looks like AW-123456789.' : null,
            default => null,
        };
    }
}
