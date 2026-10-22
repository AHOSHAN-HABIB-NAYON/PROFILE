<?php
declare(strict_types=1);

namespace OryzenX\Tests\Integration;

use OryzenX\Core\App;
use OryzenX\Core\Database;
use OryzenX\Services\InvestmentService;
use OryzenX\Services\LedgerService;

final class AuthAndAccessTest extends IntegrationTestCase
{
    private function csrfCookie(): array
    {
        return [['oryx_csrf' => 'testcsrf-token-1234567890'], ['X-CSRF-Token' => 'testcsrf-token-1234567890']];
    }

    private function codeFromEmail(string $email): string
    {
        $mail = $this->lastEmail($email);
        $this->assertNotNull($mail, 'verification email queued');
        preg_match('/\b(\d{6})\b/', $mail['body_text'], $m);
        return $m[1];
    }

    public function testRegistrationVerificationLoginLogout(): void
    {
        [$cookies, $headers] = $this->csrfCookie();
        $r = $this->api('POST', '/api/auth/register', [
            'full_name' => 'Karim Ahmed', 'email' => 'Karim@Example.test', 'password' => 'StrongPass123', 'password_confirmation' => 'StrongPass123',
            'accept_terms' => true, 'client' => 'android',
        ], null, $headers, $cookies);
        $this->assertSame(201, $r['status'], json_encode($r['json']));
        $token = $r['json']['data']['token'];
        $this->assertFalse($r['json']['data']['user']['verification']['email_verified'], 'new accounts start unverified');

        // unverified users cannot reach financial data
        $this->assertSame(403, $this->api('GET', '/api/dashboard', [], $token)['status']);
        // a client-side flag cannot verify the account
        $this->api('PUT', '/api/me/profile', ['full_name' => 'Karim Ahmed', 'email_verified' => true], $token);
        $this->assertNull($this->db->value('SELECT email_verified_at FROM users WHERE email = "karim@example.test"'));

        $this->assertSame(400, $this->api('POST', '/api/auth/verify-email', ['code' => '000000'], $token)['status']);
        $code = $this->codeFromEmail('karim@example.test');
        $v = $this->api('POST', '/api/auth/verify-email', ['code' => $code], $token);
        $this->assertSame(200, $v['status']);
        $this->assertTrue($v['json']['data']['user']['verification']['email_verified']);
        $this->assertFalse($v['json']['data']['user']['verification']['fully_verified'], 'identity review still required');
        $this->assertSame(200, $this->api('GET', '/api/dashboard', [], $token)['status']);

        // used code cannot be reused
        $this->assertSame(400, $this->api('POST', '/api/auth/verify-email', ['code' => $code], $token)['status']);

        $login = $this->api('POST', '/api/auth/login', ['email' => 'karim@example.test', 'password' => 'StrongPass123', 'client' => 'android'], null, $headers, $cookies);
        $this->assertSame(200, $login['status']);
        $t2 = $login['json']['data']['token'];
        $this->assertSame(200, $this->api('POST', '/api/auth/logout', [], $t2)['status']);
        $this->assertSame(401, $this->api('GET', '/api/me', [], $t2)['status'], 'logged-out token is revoked');
    }

    public function testPasswordIsHashedAndWeakPasswordsRejected(): void
    {
        [$cookies, $headers] = $this->csrfCookie();
        $r = $this->api('POST', '/api/auth/register', ['full_name' => 'A B', 'email' => 'weak@example.test', 'password' => 'short', 'password_confirmation' => 'short', 'accept_terms' => true], null, $headers, $cookies);
        $this->assertSame(422, $r['status']);
        $this->assertArrayHasKey('password', $r['json']['error']['fields']);
        $this->api('POST', '/api/auth/register', ['full_name' => 'A B', 'email' => 'ok@example.test', 'password' => 'GoodPass12345', 'password_confirmation' => 'GoodPass12345', 'accept_terms' => true], null, $headers, $cookies);
        $hash = $this->db->value('SELECT password_hash FROM users WHERE email = "ok@example.test"');
        $this->assertNotSame('GoodPass12345', $hash);
        $this->assertTrue(password_verify('GoodPass12345', $hash));
    }

    public function testLoginRateLimitAndLockout(): void
    {
        $u = $this->createUser(['email' => 'lock@example.test']);
        [$cookies, $headers] = $this->csrfCookie();
        $statuses = [];
        for ($i = 0; $i < 9; $i++) {
            $statuses[] = $this->api('POST', '/api/auth/login', ['email' => 'lock@example.test', 'password' => 'wrong-password'], null, $headers + ['_ip' => '10.9.9.' . $i], $cookies)['status'];
        }
        $this->assertContains(423, $statuses, 'account locks after repeated failures');
        $correct = $this->api('POST', '/api/auth/login', ['email' => 'lock@example.test', 'password' => 'Password1234'], null, $headers + ['_ip' => '10.9.8.1'], $cookies);
        $this->assertContains($correct['status'], [423, 429], 'even the right password is refused while locked');
        $this->assertGreaterThan(0, (int) $this->db->value('SELECT COUNT(*) FROM login_history WHERE user_id = :u AND success = 0', ['u' => $u]));
    }

    public function testPasswordResetTokenIsSingleUseAndExpires(): void
    {
        $u = $this->createUser(['email' => 'reset@example.test']);
        [$cookies, $headers] = $this->csrfCookie();
        $other = $this->token($u);
        $r = $this->api('POST', '/api/auth/forgot-password', ['email' => 'reset@example.test'], null, $headers, $cookies);
        $this->assertSame(200, $r['status']);
        $unknown = $this->api('POST', '/api/auth/forgot-password', ['email' => 'nobody@example.test'], null, $headers, $cookies);
        $this->assertSame($r['json']['data']['message'], $unknown['json']['data']['message'], 'no account enumeration');

        preg_match('/token=([A-Za-z0-9_-]+)/', $this->lastEmail('reset@example.test')['body_text'], $m);
        $token = $m[1];
        $ok = $this->api('POST', '/api/auth/reset-password', ['token' => $token, 'password' => 'BrandNewPass99', 'password_confirmation' => 'BrandNewPass99'], null, $headers, $cookies);
        $this->assertSame(200, $ok['status']);
        $this->assertSame(401, $this->api('GET', '/api/me', [], $other)['status'], 'reset signs out every device');
        $again = $this->api('POST', '/api/auth/reset-password', ['token' => $token, 'password' => 'AnotherPass99', 'password_confirmation' => 'AnotherPass99'], null, $headers, $cookies);
        $this->assertSame(400, $again['status'], 'token cannot be reused');

        // expired token
        $this->api('POST', '/api/auth/forgot-password', ['email' => 'reset@example.test'], null, $headers + ['_ip' => '10.1.1.9'], $cookies);
        preg_match('/token=([A-Za-z0-9_-]+)/', $this->lastEmail('reset@example.test')['body_text'], $m2);
        $this->db->run('UPDATE password_reset_tokens SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE used_at IS NULL');
        $expired = $this->api('POST', '/api/auth/reset-password', ['token' => $m2[1], 'password' => 'AnotherPass99', 'password_confirmation' => 'AnotherPass99'], null, $headers, $cookies);
        $this->assertSame(400, $expired['status']);
    }

    public function testUserCannotSeeAnotherUsersRecords(): void
    {
        $a = $this->createUser();
        $b = $this->createUser();
        $this->deposit($b, '1000');
        App::get(InvestmentService::class)->addEntry($b, ['asset_id' => $this->assetId('ETH'), 'quantity' => '1', 'unit_price' => '3000', 'funding' => 'external'], null);
        $loan = App::get(\OryzenX\Services\LoanService::class)->create($b, ['denomination' => 'USD', 'principal_usd' => '100', 'credited_to' => 'external'], null);
        $bTx = (int) $this->db->value('SELECT id FROM financial_transactions WHERE user_id = :u LIMIT 1', ['u' => $b]);
        $ta = $this->token($a);

        $this->assertSame(404, $this->api('GET', '/api/transactions/' . $bTx, [], $ta)['status']);
        $this->assertSame(404, $this->api('GET', '/api/loans/' . $loan['loan_id'], [], $ta)['status']);
        $list = $this->api('GET', '/api/transactions', [], $ta);
        $this->assertSame([], $list['json']['data']);
        $this->assertSame('0', $this->api('GET', '/api/dashboard', [], $ta)['json']['data']['all_balance_usd']);
        // query parameters cannot widen the scope
        $this->assertSame([], $this->api('GET', '/api/transactions?user_id=' . $b, [], $ta)['json']['data']);
    }

    public function testOrdinaryUsersCannotUseAdminApi(): void
    {
        $u = $this->createUser();
        $t = $this->token($u);
        foreach (['/api/admin/dashboard', '/api/admin/users', '/api/admin/ledger', '/api/admin/settings'] as $path) {
            $this->assertSame(403, $this->api('GET', $path, [], $t)['status'], $path);
        }
        $this->assertSame(403, $this->api('POST', '/api/admin/ledger/movements', ['user_id' => $u, 'type' => 'deposit', 'amount' => '1000000', 'idempotency_key' => 'attack-1234567'], $t)['status']);
        $this->assertSame('0', App::get(LedgerService::class)->balance($u, 'cash'));
        $this->assertSame(401, $this->api('GET', '/api/admin/dashboard')['status']);
    }

    public function testAdminPermissionsAreEnforcedPerAction(): void
    {
        $officer = $this->createAdmin('verification_officer');
        $user = $this->createUser();
        $t = $this->token($officer);
        $this->assertSame(200, $this->api('GET', '/api/admin/verifications', [], $t)['status']);
        $this->assertSame(403, $this->api('POST', '/api/admin/trades', ['user_id' => $user, 'asset_id' => $this->assetId('SOL'), 'direction' => 'long', 'quantity' => '1', 'entry_price' => '1', 'idempotency_key' => 'x-1234567890'], $t)['status']);
        $this->assertSame(403, $this->api('GET', '/api/admin/settings', [], $t)['status']);

        $finance = $this->createAdmin('finance_admin');
        $tf = $this->token($finance);
        $ok = $this->api('POST', '/api/admin/ledger/movements', ['user_id' => $user, 'type' => 'deposit', 'amount' => '250.50', 'idempotency_key' => 'dep-0000000001'], $tf);
        $this->assertSame(200, $ok['status'], json_encode($ok['json']));
        $dup = $this->api('POST', '/api/admin/ledger/movements', ['user_id' => $user, 'type' => 'deposit', 'amount' => '250.50', 'idempotency_key' => 'dep-0000000001'], $tf);
        $this->assertTrue($dup['json']['data']['duplicate']);
        $this->assertSame('250.5', App::get(LedgerService::class)->balance($user, 'cash'));
        $this->assertGreaterThan(0, (int) $this->db->value('SELECT COUNT(*) FROM financial_transactions WHERE created_by = :a', ['a' => $finance]));
        // floats are refused for money (strings only)
        $bad = $this->api('POST', '/api/admin/ledger/movements', ['user_id' => $user, 'type' => 'deposit', 'amount' => 0.1, 'idempotency_key' => 'dep-0000000002'], $tf);
        $this->assertSame(422, $bad['status']);
    }

    public function testSensitiveAdminActionsRequireRecentPasswordConfirmation(): void
    {
        $admin = $this->createAdmin();
        $user = $this->createUser();
        $t = $this->token($admin);
        $this->db->run('UPDATE user_sessions SET reauth_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)');
        $r = $this->api('POST', '/api/admin/users/' . $user . '/status', ['status' => 'suspended', 'reason' => 'test'], $t);
        $this->assertSame(428, $r['status']);
        $this->assertSame(401, $this->api('POST', '/api/auth/reauth', ['password' => 'wrong'], $t)['status']);
        $this->assertSame(200, $this->api('POST', '/api/auth/reauth', ['password' => 'Password1234'], $t)['status']);
        $this->assertSame(200, $this->api('POST', '/api/admin/users/' . $user . '/status', ['status' => 'suspended', 'reason' => 'test'], $t)['status']);
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM admin_audit_logs WHERE action = "user.suspended" AND actor_id = :a', ['a' => $admin]));
    }

    public function testSuspendedAccountsAreBlocked(): void
    {
        $u = $this->createUser(['email' => 'sus@example.test']);
        $t = $this->token($u);
        $this->db->update('users', ['status' => 'suspended'], 'id = :id', ['id' => $u]);
        $this->assertSame(403, $this->api('GET', '/api/me', [], $t)['status']);
        [$cookies, $headers] = $this->csrfCookie();
        $this->assertSame(403, $this->api('POST', '/api/auth/login', ['email' => 'sus@example.test', 'password' => 'Password1234'], null, $headers, $cookies)['status']);
    }

    public function testCookieSessionWritesRequireCsrfToken(): void
    {
        $u = $this->createUser(['email' => 'web@example.test']);
        [$cookies, $headers] = $this->csrfCookie();
        $login = $this->api('POST', '/api/auth/login', ['email' => 'web@example.test', 'password' => 'Password1234'], null, $headers, $cookies);
        $this->assertSame(200, $login['status']);
        $sid = null;
        foreach ($login['response']->cookies() as [$name, $value]) {
            if ($name === 'oryx_sid') {
                $sid = $value;
            }
        }
        $this->assertNotNull($sid);
        $csrf = $login['json']['data']['csrf_token'];
        $noToken = $this->api('PUT', '/api/me/preferences', ['locale' => 'bn'], null, [], ['oryx_sid' => $sid]);
        $this->assertSame(419, $noToken['status']);
        $ok = $this->api('PUT', '/api/me/preferences', ['locale' => 'bn'], null, ['X-CSRF-Token' => $csrf], ['oryx_sid' => $sid]);
        $this->assertSame(200, $ok['status']);
        $cross = $this->api('PUT', '/api/me/preferences', ['locale' => 'en'], null, ['X-CSRF-Token' => $csrf, 'Origin' => 'https://evil.example'], ['oryx_sid' => $sid]);
        $this->assertSame(403, $cross['status']);
        // anonymous form posts need the double-submit cookie
        $this->assertSame(419, $this->api('POST', '/api/auth/login', ['email' => 'web@example.test', 'password' => 'Password1234'])['status']);
    }

    public function testIdentityVerificationReviewWorkflow(): void
    {
        $u = $this->createUser(['identity_status' => 'not_submitted', 'email' => 'kyc@example.test']);
        $officer = $this->createAdmin('verification_officer');
        $img = sys_get_temp_dir() . '/oryx-doc-' . getmypid() . '.jpg';
        $im = imagecreatetruecolor(900, 600);
        imagefill($im, 0, 0, imagecolorallocate($im, 230, 230, 240));
        imagestring($im, 5, 40, 40, 'NATIONAL ID 1234567890', imagecolorallocate($im, 0, 0, 0));
        imagejpeg($im, $img, 92);
        $svc = App::get(\OryzenX\Services\VerificationService::class);
        $svc->submit($u, 'national_id', '1990 1234 5678', ['front' => ['tmp_name' => $img, 'size' => filesize($img), 'error' => 0]], true);
        $this->assertSame('pending', $this->db->value('SELECT identity_status FROM users WHERE id = :u', ['u' => $u]));
        $row = $this->db->one('SELECT * FROM user_verifications WHERE user_id = :u', ['u' => $u]);
        $this->assertStringNotContainsString('12345678', $row['document_number_masked']);
        $this->assertStringStartsWith('private:', $row['front_path'], 'documents are stored outside the web root');

        try {
            $svc->review((int) $row['id'], 'rejected', 'blurry', '', $officer);
            $this->fail('Rejection needs a user message');
        } catch (\OryzenX\Core\HttpException $e) {
            $this->assertSame(422, $e->status);
        }
        $svc->review((int) $row['id'], 'approved', 'clear photo', null, $officer);
        $this->assertSame('approved', $this->db->value('SELECT identity_status FROM users WHERE id = :u', ['u' => $u]));
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM admin_audit_logs WHERE action = "verification.approved" AND actor_id = :a', ['a' => $officer]));
        $this->assertNotNull($this->db->value('SELECT id FROM email_queue WHERE user_id = :u AND template = "verification_decision"', ['u' => $u]), 'user is emailed the decision');
        // ordinary users cannot fetch documents
        $this->assertSame(403, $this->api('GET', '/api/admin/verifications/' . $row['id'] . '/document/front', [], $this->token($u))['status']);
        $doc = $this->api('GET', '/api/admin/verifications/' . $row['id'] . '/document/front', [], $this->token($officer));
        $this->assertSame(200, $doc['status']);
        @unlink($img);
    }

    public function testAdminCountsOnlyVisibleToAdmins(): void
    {
        $admin = $this->createAdmin();
        $this->createUser();
        $r = $this->api('GET', '/api/dashboard', [], $this->token($admin));
        $this->assertSame(2, $r['json']['data']['admin_total_users']);
    }

    public function testDatesInTheFutureAreRejected(): void
    {
        $admin = $this->createAdmin();
        $user = $this->createUser();
        $r = $this->api('POST', '/api/admin/investments', ['user_id' => $user, 'asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '100', 'funding' => 'external',
            'acquired_at' => gmdate('Y-m-d\TH:i', time() + 86400 * 3), 'idempotency_key' => 'future-12345678'], $this->token($admin));
        $this->assertSame(422, $r['status']);
        unset($r);
        $this->assertSame(0, (int) Database::instance()->value('SELECT COUNT(*) FROM investment_entries'));
    }
}
