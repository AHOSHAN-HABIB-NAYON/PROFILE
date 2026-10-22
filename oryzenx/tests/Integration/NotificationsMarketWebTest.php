<?php
declare(strict_types=1);

namespace OryzenX\Tests\Integration;

use OryzenX\Core\App;
use OryzenX\Core\Config;
use OryzenX\Services\HttpClient;
use OryzenX\Services\InvestmentService;
use OryzenX\Services\MailService;
use OryzenX\Services\Market\BinanceProvider;
use OryzenX\Services\Market\CoinGeckoProvider;
use OryzenX\Services\NotificationService;
use OryzenX\Services\PushService;
use OryzenX\Services\SchedulerService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\SupportService;
use OryzenX\Services\TradeService;
use OryzenX\Services\UploadService;

final class NotificationsMarketWebTest extends IntegrationTestCase
{
    // ------------------------------------------------------------ email
    public function testEventKeysPreventDuplicateEmails(): void
    {
        $mail = App::get(MailService::class);
        $a = $mail->queue('x@example.test', 'X', 'test_email', ['time' => 'now'], 'evt:1');
        $b = $mail->queue('x@example.test', 'X', 'test_email', ['time' => 'now'], 'evt:1');
        $this->assertNotNull($a);
        $this->assertNull($b);
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM email_queue'));
    }

    public function testLogDriverDeliversAndRecordsStatus(): void
    {
        $mail = App::get(MailService::class);
        $id = $mail->queue('x@example.test', 'X', 'test_email', ['time' => 'now']);
        $this->assertSame('sent', $mail->deliver($id));
        $this->assertSame('sent', $this->db->value('SELECT status FROM email_queue WHERE id = :id', ['id' => $id]));
        $this->assertSame(['attempted', 'accepted'], array_column($this->db->all('SELECT status FROM email_logs WHERE email_queue_id = :id ORDER BY id', ['id' => $id]), 'status'));
        $this->assertSame('locked', $mail->deliver($id), 'a sent message is never sent twice');
    }

    public function testSmtpFailuresRetryThenFailWithoutClaimingDelivery(): void
    {
        $cfg = Config::all();
        $cfg['mail']['driver'] = 'smtp';
        Config::set($cfg);
        try {
            $s = App::get(SettingsService::class);
            $mail = App::get(MailService::class);
            $id = $mail->queue('x@example.test', 'X', 'test_email', ['time' => 'now']);
            // not configured: stays queued, no attempt counted
            $this->assertSame('skipped', $mail->deliver($id));
            $this->assertSame('queued', $this->db->value('SELECT status FROM email_queue WHERE id = :id', ['id' => $id]));
            $test = $mail->sendTest('admin@example.test');
            $this->assertFalse($test['ok']);
            $this->assertSame('configuration', $test['stage']);

            $s->set('smtp_enabled', '1');
            $s->set('smtp_host', '127.0.0.1');
            $s->set('smtp_port', '1'); // nothing listens here → connection failure (temporary)
            $s->set('smtp_encryption', 'none');
            $s->set('smtp_timeout', '5');
            $s->set('smtp_from_email', 'noreply@example.test');
            $this->assertSame('retry', $mail->deliver($id));
            $row = $this->db->one('SELECT * FROM email_queue WHERE id = :id', ['id' => $id]);
            $this->assertSame('queued', $row['status']);
            $this->assertSame('1', (string) $row['attempts']);
            $this->assertGreaterThan(gmdate('Y-m-d H:i:s'), $row['next_attempt_at'], 'retry is scheduled with backoff');
            $this->db->run('UPDATE email_queue SET attempts = max_attempts - 1, next_attempt_at = UTC_TIMESTAMP() WHERE id = :id', ['id' => $id]);
            $this->assertSame('failed', $mail->deliver($id), 'retries are limited');
            $this->assertNull($this->db->value('SELECT sent_at FROM email_queue WHERE id = :id', ['id' => $id]));
        } finally {
            $cfg['mail']['driver'] = 'log';
            Config::set($cfg);
        }
    }

    public function testProfitEmailsDescribeRealizedEventsAndThresholdEmailsSayUnrealized(): void
    {
        $u = $this->createUser(['email' => 'pnl@example.test']);
        $this->useFixedPrices(['SOL' => '150']);
        App::get(TradeService::class)->record($u, ['asset_id' => $this->assetId('SOL'), 'direction' => 'long', 'quantity' => '1', 'entry_price' => '100', 'exit_price' => '120', 'fee_usd' => '1', 'opened_at' => gmdate('Y-m-d H:i:s', time() - 600), 'closed_at' => gmdate('Y-m-d H:i:s', time() - 60)], null);
        $mail = $this->db->one('SELECT * FROM email_queue WHERE user_id = :u AND template = "pnl_event"', ['u' => $u]);
        $this->assertNotNull($mail);
        $this->assertStringContainsString('Realized profit recorded: +19.00 USD', $mail['subject']);
        $this->assertStringContainsString('realized result', $mail['body_text']);

        $this->db->run('UPDATE notification_preferences SET email_portfolio_threshold = 1, threshold_pct = 5 WHERE user_id = :u', ['u' => $u]);
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '100', 'funding' => 'external'], null);
        $sch = App::get(SchedulerService::class);
        $sch->run('portfolio_threshold'); // records reference value
        $this->setPrice('SOL', '170');
        $sch->run('portfolio_threshold');
        $t = $this->db->one('SELECT * FROM email_queue WHERE user_id = :u AND template = "portfolio_threshold"', ['u' => $u]);
        $this->assertNotNull($t);
        $this->assertStringContainsString('not realized profit', $t['body_text']);
        $this->assertStringNotContainsString('Realized profit recorded', $t['subject']);
    }

    public function testFiveDayReminderIsOptionalAndNotDuplicated(): void
    {
        $u = $this->createUser(['email' => 'rem@example.test', 'created_at' => gmdate('Y-m-d H:i:s', time() - 10 * 86400)]);
        $opt = $this->createUser(['created_at' => gmdate('Y-m-d H:i:s', time() - 10 * 86400)]);
        $this->db->run('UPDATE notification_preferences SET email_reminders = 0 WHERE user_id = :u', ['u' => $opt]);
        $sch = App::get(SchedulerService::class);
        $this->assertSame('Reminders disabled', $sch->run('reminders')['message']);
        App::get(SettingsService::class)->set('reminder_enabled', '1');
        $sch->run('reminders');
        $sch->run('reminders');
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM email_queue WHERE template = "reminder" AND user_id = :u', ['u' => $u]));
        $this->assertSame(0, (int) $this->db->value('SELECT COUNT(*) FROM email_queue WHERE template = "reminder" AND user_id = :u', ['u' => $opt]), 'opted-out users get no reminder');
    }

    public function testOptionalEmailsRespectPreferencesButSecurityAlwaysSends(): void
    {
        $u = $this->createUser();
        $this->db->run('UPDATE notification_preferences SET email_trades = 0 WHERE user_id = :u', ['u' => $u]);
        $n = App::get(NotificationService::class);
        $n->dispatch($u, 'trade_recorded', ['asset' => 'SOL', 'direction' => 'long', 'quantity' => '1', 'price' => '100'], 'k1');
        $this->assertSame(0, (int) $this->db->value('SELECT COUNT(*) FROM email_queue WHERE user_id = :u', ['u' => $u]));
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM notifications WHERE user_id = :u', ['u' => $u]));
        $n->securityEvent($u, 'password_changed', []);
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM email_queue WHERE user_id = :u AND template = "security_event"', ['u' => $u]));
    }

    public function testBanglaEmailsForBanglaUsers(): void
    {
        $u = $this->createUser(['locale' => 'bn']);
        App::get(NotificationService::class)->dispatch($u, 'salary_status', ['period' => '2026-09', 'status' => 'paid'], 'bn1');
        $m = $this->db->one('SELECT subject, body_text FROM email_queue WHERE user_id = :u', ['u' => $u]);
        $this->assertStringContainsString('বেতন', $m['subject']);
    }

    // ------------------------------------------------------------ push
    public function testPushIsSkippedAndLoggedWhenFirebaseIsNotConfigured(): void
    {
        $u = $this->createUser();
        $push = App::get(PushService::class);
        $push->registerToken($u, str_repeat('a', 40) . ':APA91bTestToken', 'android', 'Pixel');
        $r = $push->sendToUser($u, 'OryzenX', 'Hello', [], 'evt-1');
        $this->assertSame(['sent' => 0, 'failed' => 0, 'skipped' => 1], $r);
        $this->assertSame('skipped', $this->db->value('SELECT status FROM push_logs'));
        $this->assertStringNotContainsString('APA91bTestToken', (string) $this->db->value('SELECT token_encrypted FROM push_tokens'), 'tokens are encrypted at rest');
        // a device token belongs to one account: re-registering moves it
        $v = $this->createUser();
        $push->registerToken($v, str_repeat('a', 40) . ':APA91bTestToken', 'android', 'Pixel');
        $this->assertSame($v, (int) $this->db->value('SELECT user_id FROM push_tokens'));
    }

    // ------------------------------------------------------------ market data parsing
    public function testCoinGeckoParsingKeepsSmallPricesExact(): void
    {
        HttpClient::$fake = function ($m, $url) {
            $this->assertStringContainsString('ids=solana%2Cpepe', $url);
            return ['status' => 200, 'body' => '{"solana":{"usd":142.37,"usd_24h_change":-3.1234,"last_updated_at":1761100000},"pepe":{"usd":0.00000951,"usd_24h_change":1.5,"last_updated_at":1761100000}}'];
        };
        $p = (new CoinGeckoProvider())->prices([
            ['id' => 1, 'symbol' => 'SOL', 'coingecko_id' => 'solana', 'binance_symbol' => null],
            ['id' => 6, 'symbol' => 'PEPE', 'coingecko_id' => 'pepe', 'binance_symbol' => null],
        ]);
        $this->assertSame('142.37', $p['SOL']['price']);
        $this->assertSame('0.00000951', $p['PEPE']['price']);
    }

    public function testBinanceParsingAndProviderErrors(): void
    {
        HttpClient::$fake = fn () => ['status' => 200, 'body' => '[{"symbol":"ETHUSDT","lastPrice":"3201.55000000","priceChangePercent":"-1.200","closeTime":1761100000000}]'];
        $p = (new BinanceProvider())->prices([['id' => 2, 'symbol' => 'ETH', 'coingecko_id' => null, 'binance_symbol' => 'ETHUSDT']]);
        $this->assertSame('3201.55', $p['ETH']['price']);
        HttpClient::$fake = fn () => ['status' => 429, 'body' => 'rate limited'];
        $this->expectException(\OryzenX\Services\Market\MarketDataException::class);
        (new CoinGeckoProvider())->prices([['id' => 1, 'symbol' => 'SOL', 'coingecko_id' => 'solana', 'binance_symbol' => null]]);
    }

    // ------------------------------------------------------------ support form
    public function testSupportFormSpamProtectionAndRateLimit(): void
    {
        $svc = App::get(SupportService::class);
        $good = ['name' => 'Rafi', 'email' => 'rafi@example.test', 'subject' => 'Help please', 'message' => 'I cannot find my salary record.', 'form_token' => (time() - 10) . '.' . substr(hash_hmac('sha256', 'support|' . (time() - 10), \OryzenX\Core\Security::appKey()), 0, 24)];
        try {
            $svc->submit($good + ['website' => 'http://spam'], '10.2.2.2', null, 'en');
            $this->fail('honeypot');
        } catch (\OryzenX\Core\HttpException $e) {
            $this->assertSame(422, $e->status);
        }
        try {
            $svc->submit(['form_token' => SupportService::formToken()] + $good, '10.2.2.3', null, 'en');
            $this->fail('too-fast submission must be rejected');
        } catch (\OryzenX\Core\HttpException $e) {
            $this->assertSame(422, $e->status);
        }
        $id = $svc->submit($good, '10.2.2.4', null, 'bn');
        $this->assertGreaterThan(0, $id);
        $this->assertNotSame('10.2.2.4', $this->db->value('SELECT ip_hash FROM support_requests'), 'IP stored as a hash');
        $codes = [];
        for ($i = 0; $i < 6; $i++) {
            try {
                $svc->submit($good, '10.2.2.9', null, 'en');
                $codes[] = 200;
            } catch (\OryzenX\Core\HttpException $e) {
                $codes[] = $e->status;
            }
        }
        $this->assertContains(429, $codes);
    }

    // ------------------------------------------------------------ uploads
    public function testLargeImagesAreCompressedAndUnsafeFilesRejected(): void
    {
        $up = App::get(UploadService::class);
        $src = sys_get_temp_dir() . '/oryx-big-' . getmypid() . '.jpg';
        // photo-like test image: smooth gradients, shapes and fine detail, saved at maximum JPEG quality
        $im = imagecreatetruecolor(4000, 3000);
        for ($y = 0; $y < 3000; $y++) {
            imageline($im, 0, $y, 3999, $y, imagecolorallocate($im, (int) (40 + $y / 15), (int) (90 + $y / 30), (int) (200 - $y / 20)));
        }
        for ($i = 0; $i < 2500; $i++) {
            imagefilledellipse($im, random_int(0, 4000), random_int(0, 3000), random_int(10, 160), random_int(10, 160), imagecolorallocatealpha($im, random_int(0, 255), random_int(0, 255), random_int(0, 255), random_int(40, 110)));
        }
        for ($i = 0; $i < 400; $i++) {
            imagestring($im, 5, random_int(0, 3900), random_int(0, 2980), 'OryzenX document text ' . $i, imagecolorallocate($im, 10, 10, 10));
        }
        imagejpeg($im, $src, 93);
        $orig = filesize($src);
        fwrite(STDERR, sprintf("\n[upload] original %.2f MB", $orig / 1048576));
        $r = $up->store(['tmp_name' => $src, 'size' => $orig, 'error' => 0], 'document', 'verification', true);
        fwrite(STDERR, sprintf(" -> document %.0f KB (%dx%d)", $r['bytes'] / 1024, $r['width'], $r['height']));
        $this->assertLessThanOrEqual(2400, max($r['width'], $r['height']));
        $this->assertLessThan($orig / 4, $r['bytes'], 'compressed substantially');
        $this->assertSame('image/jpeg', $r['mime']);
        $a = $up->store(['tmp_name' => $src, 'size' => $orig, 'error' => 0], 'avatar', 'avatars', true);
        fwrite(STDERR, sprintf(", avatar %.0f KB\n", $a['bytes'] / 1024));
        $this->assertLessThanOrEqual(512, max($a['width'], $a['height']));
        $this->assertLessThan(500 * 1024, $a['bytes']);

        $php = sys_get_temp_dir() . '/oryx-evil-' . getmypid() . '.jpg';
        file_put_contents($php, "<?php system('id'); ?>");
        try {
            $up->store(['tmp_name' => $php, 'size' => filesize($php), 'error' => 0], 'avatar', 'avatars', true);
            $this->fail('PHP disguised as JPG must be rejected');
        } catch (\OryzenX\Core\HttpException $e) {
            $this->assertSame(422, $e->status);
        }
        $svg = UploadService::sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><a href="javascript:x"><circle r="5"/></a><rect width="10" height="10" fill="url(https://evil/x)"/><path d="M0 0L5 5" fill="#000"/></svg>');
        $this->assertStringNotContainsString('script', $svg);
        $this->assertStringNotContainsString('onload', $svg);
        $this->assertStringNotContainsString('javascript', $svg);
        $this->assertStringNotContainsString('evil', $svg);
        $this->assertStringContainsString('<path', $svg);
        @unlink($src);
        @unlink($php);
    }

    // ------------------------------------------------------------ public website
    public function testPublicMarketPricesShowLivePricesOnlyAndAreRateLimited(): void
    {
        $this->useFixedPrices(['SOL' => '120.5', 'ETH' => '3000']);
        $res = $this->handle($this->request('GET', '/api/public/markets'));
        $this->assertSame(200, $res->status);
        $body = json_decode($res->body, true);
        $this->assertTrue($body['ok']);
        $sol = array_values(array_filter($body['data'], fn ($a) => $a['symbol'] === 'SOL'))[0];
        $this->assertSame('120.5', $sol['price']);
        $this->assertFalse($sol['simulated']);
        $allowed = ['symbol', 'name', 'color', 'logo_url', 'price', 'price_decimals', 'change_24h_pct', 'updated_at', 'stale', 'simulated'];
        foreach ($body['data'] as $row) {
            $this->assertSame([], array_diff(array_keys($row), $allowed), 'public markets must expose market data only');
        }
        // an asset without a provider price is reported as missing, never invented
        $xrp = array_values(array_filter($body['data'], fn ($a) => $a['symbol'] === 'XRP'))[0];
        $this->assertNull($xrp['price']);
        // landing page contains the live section
        $this->assertStringContainsString('id="markets"', $this->handle($this->request('GET', '/?lang=en'))->body);
        for ($i = 0; $i < 30; $i++) {
            $this->handle($this->request('GET', '/api/public/markets'));
        }
        $this->assertSame(429, $this->handle($this->request('GET', '/api/public/markets'))->status);
    }

    public function testLandingPageInBothLanguagesWithoutMixing(): void
    {
        $en = $this->handle($this->request('GET', '/?lang=en'));
        $bn = $this->handle($this->request('GET', '/?lang=bn'));
        $this->assertSame(200, $en->status);
        $this->assertStringContainsString('<html lang="en"', $en->body);
        $this->assertStringContainsString('<html lang="bn"', $bn->body);
        $enLines = require Config::basePath('resources/lang/en/landing.php');
        $bnLines = require Config::basePath('resources/lang/bn/landing.php');
        foreach (['hero_title', 'features_title', 'faq_title', 'support_title', 'footer_privacy'] as $k) {
            $this->assertStringContainsString(htmlspecialchars($enLines[$k], ENT_QUOTES), $en->body, $k);
            $this->assertStringContainsString(htmlspecialchars($bnLines[$k], ENT_QUOTES), $bn->body, $k);
            $this->assertStringNotContainsString(htmlspecialchars($enLines[$k], ENT_QUOTES), $bn->body, "English '$k' leaked into Bangla page");
        }
        foreach (['id="home"', 'id="features"', 'id="how"', 'id="security"', 'id="faq"', 'id="support"', 'rel="canonical"', 'og:title', 'hreflang="bn"'] as $needle) {
            $this->assertStringContainsString($needle, $en->body);
        }
        $this->assertStringNotContainsString('support@', $en->body, 'no invented support email');
        $this->assertNotNull($en->getHeader('Content-Security-Policy'));
        $this->assertSame('DENY', $en->getHeader('X-Frame-Options'));
        foreach (['/privacy', '/terms', '/risk', '/privacy?lang=bn'] as $p) {
            $this->assertSame(200, $this->handle($this->request('GET', $p))->status, $p);
        }
        $this->assertStringContainsString('Disallow: /v2admin', $this->handle($this->request('GET', '/robots.txt'))->body);
        $this->assertStringContainsString('<urlset', $this->handle($this->request('GET', '/sitemap.xml'))->body);
        $this->assertSame(404, $this->handle($this->request('GET', '/does-not-exist'))->status);
        $this->assertSame(403, $this->handle($this->request('GET', '/install'))->status, 'installer is locked once installed');
    }

    public function testPublicDirectoryHoldsNoSecrets(): void
    {
        $public = Config::basePath('public');
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($public, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            $name = $file->getFilename();
            $this->assertDoesNotMatchRegularExpression('/^config\.php$|\.sql(\.gz)?$|\.env$|\.log$/', $name, (string) $file);
        }
        $this->assertFileExists(Config::basePath('public/uploads/.htaccess'));
    }
}
