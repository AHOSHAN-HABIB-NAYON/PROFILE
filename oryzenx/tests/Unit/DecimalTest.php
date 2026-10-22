<?php
declare(strict_types=1);

namespace OryzenX\Tests\Unit;

use OryzenX\Core\Decimal as D;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Runs every case against the pure-PHP implementation (and bcmath when the extension is loaded). */
final class DecimalTest extends TestCase
{
    public static function engines(): array
    {
        $e = [['pure' => false]];
        if (extension_loaded('bcmath')) {
            $e[] = ['bc' => true];
        }
        return array_map(fn ($x) => [array_values($x)[0]], $e);
    }

    protected function tearDown(): void
    {
        D::useBcMath(null);
    }

    #[DataProvider('engines')]
    public function testArithmetic(bool $bc): void
    {
        D::useBcMath($bc);
        $this->assertSame('0.3', D::add('0.1', '0.2'));
        $this->assertSame('-0.1', D::sub('0.1', '0.2'));
        $this->assertSame('14', D::sub('120', '106'));
        $this->assertSame('190', D::mul('20000000', '0.0000095'));
        $this->assertSame('0.000000000000000001', D::mul('0.000000001', '0.000000001'));
        $this->assertSame('1477.5', D::add(D::mul('0.5', '2950'), '2.5'));
        $this->assertSame('0.132075471698113207', D::div('14', '106'));
        $this->assertSame('-0.056603773584905660', D::fixed(D::div('-6', '106'), 18));
        $this->assertSame('123456789012345678.123456789012345678', D::add('123456789012345678', '0.123456789012345678'));
        $this->assertSame('15241578753238836527968299765279684', D::mul('123456789012345678', '123456789012345678'));
        $this->assertSame(1, D::cmp('100.0001', '100'));
        $this->assertSame(0, D::cmp('1.50', '1.5'));
        $this->assertSame(-1, D::cmp('-2', '1'));
    }

    #[DataProvider('engines')]
    public function testRoundingAndPercentages(bool $bc): void
    {
        D::useBcMath($bc);
        $this->assertSame('13.21', D::round(D::mul(D::div('14', '106', 12), '100'), 2));
        $this->assertSame('-5.66', D::round(D::mul(D::div('-6', '106', 12), '100'), 2));
        $this->assertSame('2.35', D::round('2.345', 2));
        $this->assertSame('-2.35', D::round('-2.345', 2));
        $this->assertSame('1.50', D::fixed('1.5', 2));
        $this->assertSame('0', D::round('0.004', 2));
        $this->assertSame('12.34', D::truncate('12.3499', 2));
    }

    public function testNormalizeAndValidation(): void
    {
        $this->assertSame('1.5', D::normalize('001.500'));
        $this->assertSame('0', D::normalize('-0.000'));
        $this->assertSame('-0.5', D::normalize('-.5'));
        $this->assertFalse(D::isValid('1e5'));
        $this->assertFalse(D::isValid('12,5'));
        $this->assertFalse(D::isValid(''));
        $this->expectException(\InvalidArgumentException::class);
        D::normalize('abc');
    }

    public function testDivisionByZero(): void
    {
        $this->expectException(\DivisionByZeroError::class);
        D::div('1', '0');
    }

    /** Randomised cross-check of the pure implementation against PHP integer arithmetic. */
    public function testRandomAgainstIntegerArithmetic(): void
    {
        D::useBcMath(false);
        for ($i = 0; $i < 300; $i++) {
            $a = random_int(-999_999_999, 999_999_999);
            $b = random_int(-999_999, 999_999) ?: 7;
            $this->assertSame((string) ($a + $b), D::add((string) $a, (string) $b));
            $this->assertSame((string) ($a - $b), D::sub((string) $a, (string) $b));
            $this->assertSame((string) ($a * $b), D::mul((string) $a, (string) $b));
            $this->assertSame((string) intdiv($a, $b), D::div((string) $a, (string) $b, 0));
            // scaled values: a/100 * b/1000 == a*b / 100000
            $this->assertSame(D::normalize(self::scaled($a * $b, 5)), D::mul(self::scaled($a, 2), self::scaled($b, 3)));
        }
    }

    private static function scaled(int $v, int $scale): string
    {
        $neg = $v < 0;
        $s = str_pad((string) abs($v), $scale + 1, '0', STR_PAD_LEFT);
        return ($neg ? '-' : '') . substr($s, 0, -$scale) . '.' . substr($s, -$scale);
    }
}
