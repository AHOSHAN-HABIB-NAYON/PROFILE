<?php
declare(strict_types=1);

namespace OryzenX\Tests\Unit;

use OryzenX\Core\HttpException;
use OryzenX\Core\Migrator;
use OryzenX\Core\Router;
use OryzenX\Core\Security;
use OryzenX\Core\Validator;
use OryzenX\Services\PortfolioService;
use OryzenX\Services\TradeService;
use PHPUnit\Framework\TestCase;

final class CoreTest extends TestCase
{
    public function testHoldingValuationFormula(): void
    {
        $this->assertSame(['market_value' => '120', 'unrealized_pnl' => '14', 'return_pct' => '13.21'], PortfolioService::valueHolding('1', '106', '120'));
        $this->assertSame(['market_value' => '100', 'unrealized_pnl' => '-6', 'return_pct' => '-5.66'], PortfolioService::valueHolding('1', '106', '100'));
        $this->assertSame(['market_value' => null, 'unrealized_pnl' => null, 'return_pct' => null], PortfolioService::valueHolding('1', '106', null));
    }

    public function testTradePnlFormula(): void
    {
        $this->assertSame('24', TradeService::grossPnl('long', '2', '140', '152'));
        $this->assertSame('-24', TradeService::grossPnl('short', '2', '140', '152'));
        $this->assertSame('15', TradeService::grossPnl('short', '0.3', '3350', '3300'));
    }

    public function testValidatorRules(): void
    {
        $v = Validator::make(['email' => 'A@B.co', 'qty' => '0.5', 'n' => '3', 'flag' => 'on'], ['email' => 'required|email', 'qty' => 'required|decimal|gt:0', 'n' => 'int', 'flag' => 'bool', 'opt' => 'nullable|string'])->validated();
        $this->assertSame(['email' => 'a@b.co', 'qty' => '0.5', 'n' => 3, 'flag' => true, 'opt' => null], $v);
        $bad = Validator::make(['qty' => 0.1, 'pw' => 'abc', 'p2' => 'x'], ['qty' => 'decimal', 'pw' => 'password', 'p2' => 'same:pw', 'req' => 'required']);
        $this->assertSame(['qty', 'pw', 'p2', 'req'], array_keys($bad->errors()));
        $this->expectException(HttpException::class);
        $bad->validated();
    }

    public function testSecretsAreEncryptedAndTokensHashed(): void
    {
        $c = Security::encrypt('smtp-password');
        $this->assertStringNotContainsString('smtp-password', $c);
        $this->assertSame('smtp-password', Security::decrypt($c));
        $this->assertNull(Security::decrypt('v1s:' . base64_encode(str_repeat('x', 60))), 'tampered ciphertext is rejected');
        $this->assertSame(64, strlen(Security::hashToken('abc')));
        $this->assertNotSame(Security::hashToken('abc'), Security::hashToken('abd'));
        $this->assertSame('[redacted]', Security::redact(['smtp_password' => 'x'])['smtp_password']);
        $this->assertSame('ab••••yz', Security::mask('abcdefyz'));
    }

    public function testRouterMatchesAndRejectsWrongMethod(): void
    {
        $r = new Router();
        $r->get('/api/loans/{id:\d+}', fn () => 'ok');
        [, $params] = $r->match('GET', '/api/loans/42');
        $this->assertSame(['id' => '42'], $params);
        $this->assertNull($r->match('GET', '/api/loans/abc'));
        $this->expectException(HttpException::class);
        $r->match('POST', '/api/loans/42');
    }

    public function testSqlSplitter(): void
    {
        $this->assertCount(2, Migrator::splitSql("-- comment\nCREATE TABLE a (x INT);\n\nCREATE TABLE b (y INT);\n"));
    }
}
