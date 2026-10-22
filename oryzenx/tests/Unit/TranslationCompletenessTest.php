<?php
declare(strict_types=1);

namespace OryzenX\Tests\Unit;

use OryzenX\Core\Config;
use PHPUnit\Framework\TestCase;

/** English and Bangla must contain exactly the same keys and placeholders, and every key used by the apps must exist. */
final class TranslationCompletenessTest extends TestCase
{
    public static function langGroups(): array
    {
        return [['app'], ['landing'], ['notify'], ['email']];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('langGroups')]
    public function testKeysAndPlaceholdersMatch(string $group): void
    {
        $en = require Config::basePath("resources/lang/en/$group.php");
        $bn = require Config::basePath("resources/lang/bn/$group.php");
        $this->assertSame([], array_values(array_diff(array_keys($en), array_keys($bn))), "keys missing in bn/$group");
        $this->assertSame([], array_values(array_diff(array_keys($bn), array_keys($en))), "extra keys in bn/$group");
        foreach ($en as $k => $v) {
            if (!is_string($v)) {
                continue;
            }
            preg_match_all('/:([a-z_]+)/', $v, $a);
            preg_match_all('/:([a-z_]+)/', (string) $bn[$k], $b);
            sort($a[1]);
            $bb = array_unique($b[1]);
            sort($bb);
            $this->assertSame(array_values(array_unique($a[1])), array_values($bb), "placeholders differ for $group.$k");
            $this->assertNotSame('', trim((string) $bn[$k]), "empty Bangla text for $group.$k");
        }
    }

    public function testEveryKeyUsedByTheAppsExists(): void
    {
        $en = require Config::basePath('resources/lang/en/app.php');
        $missing = [];
        foreach (glob(Config::basePath('public/assets/js/*.js')) as $file) {
            preg_match_all('/\bt\("([a-z0-9_]+)"\s*[,)]/', (string) file_get_contents($file), $m);
            foreach ($m[1] as $key) {
                if (!isset($en[$key])) {
                    $missing[] = basename($file) . ':' . $key;
                }
            }
        }
        // dynamic key families used as t(prefix + value)
        $families = [
            'tx_' => ['deposit', 'withdrawal', 'transfer', 'adjustment', 'investment_buy', 'investment_sale', 'trade_close', 'loan_disbursement', 'loan_repayment', 'loan_charge', 'salary_payment', 'profit_allocation', 'reversal'],
            'status_' => ['completed', 'paid', 'approved', 'active', 'open', 'closed', 'reversed', 'reversal', 'pending', 'processed', 'rejected', 'suspended', 'repaid', 'sent', 'queued', 'failed', 'cancelled', 'new', 'resolved', 'spam', 'sending'],
            'identity_' => ['not_submitted', 'pending', 'approved', 'rejected'], 'doc_' => ['national_id', 'passport', 'driving_license'],
            'dir_' => ['long', 'short'], 'type_' => ['spot', 'futures', 'margin', 'other'], 'range_' => ['1D', '7D', '1M', '3M', '1Y'], 'theme_' => ['light', 'dark', 'system'],
            'charge_' => ['fee', 'interest'], 'a_funding_' => ['cash', 'external', 'loan'], 'a_credit_' => ['cash', 'external', 'holdings'],
            'a_cat_' => ['retained', 'salary', 'reinvestment', 'fees'], 'a_pm_type_' => ['wallet', 'mobile_banking', 'bank'], 'a_health_' => ['ok', 'warning', 'error'],
            'a_test_' => ['accepted', 'failed'], 'a_def_' => ['investment_value_usd', 'unrealized_pnl_usd', 'realized_pnl_usd', 'loan_liabilities_usd'],
            'nav_' => ['home', 'portfolio', 'trading', 'activity', 'more'], 'welcome_point_' => ['1', '2', '3'],
            'verify_banner_' => ['not_submitted', 'pending', 'rejected'], 'faq_q' => ['1', '2', '3', '4', '5'], 'faq_a' => ['1', '2', '3', '4', '5'],
            'pm_field_' => ['network', 'address', 'account_name', 'number', 'bank_name', 'branch', 'account_number', 'routing_number'],
        ];
        foreach ($families as $prefix => $values) {
            foreach ($values as $v) {
                if (!isset($en[$prefix . $v])) {
                    $missing[] = 'family:' . $prefix . $v;
                }
            }
        }
        foreach (['investment_balance', 'trading_balance', 'todays_profit', 'loan_balance', 'loss_balance', 'main_balance', 'total_users', 'yesterdays_profit', 'last_7_days', 'last_30_days', 'last_1_year', 'all_time', 'privacy_policy', 'terms', 'risk_disclosure', 'email_verified_title', 'email_verify_failed_title', 'email_verified_body', 'open_app'] as $k) {
            if (!isset($en[$k])) {
                $missing[] = 'dynamic:' . $k;
            }
        }
        $this->assertSame([], $missing);
    }
}
