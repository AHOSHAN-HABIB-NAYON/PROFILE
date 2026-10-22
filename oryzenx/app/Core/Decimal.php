<?php
declare(strict_types=1);

namespace OryzenX\Core;

/**
 * Exact decimal arithmetic on numeric strings.
 *
 * Money and quantities are never handled as floats. bcmath is used when the
 * extension is loaded; otherwise a pure-PHP implementation produces identical
 * results (truncating division, explicit half-up rounding via round()).
 */
final class Decimal
{
    public const SCALE = 18;

    private static ?bool $bc = null;

    public static function useBcMath(?bool $flag): void
    {
        self::$bc = $flag;
    }

    private static function bc(): bool
    {
        return self::$bc ??= extension_loaded('bcmath');
    }

    /** Validates and normalizes a decimal string (e.g. "1.50" -> "1.5", "-0" -> "0"). */
    public static function normalize(string|int $value): string
    {
        $value = trim((string) $value);
        if (!self::isValid($value)) {
            throw new \InvalidArgumentException('Invalid decimal value');
        }
        $neg = false;
        if ($value[0] === '-' || $value[0] === '+') {
            $neg = $value[0] === '-';
            $value = substr($value, 1);
        }
        [$int, $frac] = array_pad(explode('.', $value, 2), 2, '');
        $int = ltrim($int, '0');
        $frac = rtrim($frac, '0');
        if ($int === '') {
            $int = '0';
        }
        $out = $frac === '' ? $int : $int . '.' . $frac;
        if ($out === '0') {
            return '0';
        }
        return $neg ? '-' . $out : $out;
    }

    public static function isValid(string $value): bool
    {
        return (bool) preg_match('/^[+-]?(\d+(\.\d*)?|\.\d+)$/', $value);
    }

    public static function add(string $a, string $b, int $scale = self::SCALE): string
    {
        if (self::bc()) {
            return self::normalize(bcadd(self::normalize($a), self::normalize($b), $scale));
        }
        return self::fromScaled(self::intAdd(self::toScaled($a, $scale), self::toScaled($b, $scale)), $scale);
    }

    public static function sub(string $a, string $b, int $scale = self::SCALE): string
    {
        if (self::bc()) {
            return self::normalize(bcsub(self::normalize($a), self::normalize($b), $scale));
        }
        return self::fromScaled(self::intAdd(self::toScaled($a, $scale), self::intNeg(self::toScaled($b, $scale))), $scale);
    }

    public static function mul(string $a, string $b, int $scale = self::SCALE): string
    {
        if (self::bc()) {
            return self::normalize(bcmul(self::normalize($a), self::normalize($b), $scale));
        }
        // multiply as integers at full precision, then truncate to $scale
        [$ia, $sa] = self::toInt($a);
        [$ib, $sb] = self::toInt($b);
        $prod = self::intMul($ia, $ib);
        return self::truncateScaled($prod, $sa + $sb, $scale);
    }

    public static function div(string $a, string $b, int $scale = self::SCALE): string
    {
        if (self::cmp($b, '0') === 0) {
            throw new \DivisionByZeroError('Division by zero');
        }
        if (self::bc()) {
            return self::normalize(bcdiv(self::normalize($a), self::normalize($b), $scale));
        }
        [$ia, $sa] = self::toInt($a);
        [$ib, $sb] = self::toInt($b);
        // a/b = (ia/10^sa)/(ib/10^sb) = ia*10^(sb+scale) / (ib*10^sa) / 10^scale
        $num = self::intShift($ia, $sb + $scale);
        $den = self::intShift($ib, $sa);
        $q = self::intDiv($num, $den);
        return self::fromScaled($q, $scale);
    }

    public static function cmp(string $a, string $b): int
    {
        $d = self::sub($a, $b);
        if ($d === '0') {
            return 0;
        }
        return $d[0] === '-' ? -1 : 1;
    }

    public static function isZero(string $a): bool
    {
        return self::normalize($a) === '0';
    }

    public static function isNegative(string $a): bool
    {
        return self::normalize($a)[0] === '-';
    }

    public static function abs(string $a): string
    {
        return ltrim(self::normalize($a), '-');
    }

    public static function neg(string $a): string
    {
        $n = self::normalize($a);
        if ($n === '0') {
            return '0';
        }
        return $n[0] === '-' ? substr($n, 1) : '-' . $n;
    }

    public static function min(string $a, string $b): string
    {
        return self::cmp($a, $b) <= 0 ? self::normalize($a) : self::normalize($b);
    }

    public static function max(string $a, string $b): string
    {
        return self::cmp($a, $b) >= 0 ? self::normalize($a) : self::normalize($b);
    }

    /** Round half away from zero to $places decimals. */
    public static function round(string $a, int $places = 2): string
    {
        $a = self::normalize($a);
        $neg = $a[0] === '-';
        $abs = ltrim($a, '-');
        $half = '0.' . str_repeat('0', $places) . '5';
        $r = self::truncate(self::add($abs, $half, $places + 2), $places);
        return $neg && $r !== '0' ? '-' . $r : $r;
    }

    public static function truncate(string $a, int $places): string
    {
        $a = self::normalize($a);
        $neg = $a[0] === '-';
        $abs = ltrim($a, '-');
        [$int, $frac] = array_pad(explode('.', $abs, 2), 2, '');
        $frac = substr($frac, 0, $places);
        $out = self::normalize($frac === '' ? $int : $int . '.' . $frac);
        return $neg && $out !== '0' ? '-' . $out : $out;
    }

    /** Fixed number of decimals, e.g. fixed("1.5", 2) => "1.50" (rounded). */
    public static function fixed(string $a, int $places = 2): string
    {
        $r = self::round($a, $places);
        if ($places === 0) {
            return $r;
        }
        $neg = $r[0] === '-';
        $abs = ltrim($r, '-');
        [$int, $frac] = array_pad(explode('.', $abs, 2), 2, '');
        $out = $int . '.' . str_pad($frac, $places, '0');
        return $neg ? '-' . $out : $out;
    }

    /** Sum of a list of decimals. */
    public static function sum(iterable $values): string
    {
        $t = '0';
        foreach ($values as $v) {
            $t = self::add($t, (string) ($v ?? '0'));
        }
        return $t;
    }

    // ---- pure-PHP integer helpers (strings of digits with optional '-') ----

    /** @return array{0:string,1:int} integer string and its scale */
    private static function toInt(string $a): array
    {
        $a = self::normalize($a);
        $neg = $a[0] === '-';
        $abs = ltrim($a, '-');
        [$int, $frac] = array_pad(explode('.', $abs, 2), 2, '');
        $digits = ltrim($int . $frac, '0');
        if ($digits === '') {
            return ['0', 0];
        }
        return [($neg ? '-' : '') . $digits, strlen($frac)];
    }

    private static function toScaled(string $a, int $scale): string
    {
        [$i, $s] = self::toInt($a);
        if ($s > $scale) {
            return self::intTruncDivPow10($i, $s - $scale);
        }
        return self::intShift($i, $scale - $s);
    }

    private static function fromScaled(string $i, int $scale): string
    {
        $neg = $i[0] === '-';
        $abs = ltrim($i, '-');
        if ($scale > 0) {
            $abs = str_pad($abs, $scale + 1, '0', STR_PAD_LEFT);
            $abs = substr($abs, 0, -$scale) . '.' . substr($abs, -$scale);
        }
        return self::normalize(($neg ? '-' : '') . $abs);
    }

    private static function truncateScaled(string $i, int $haveScale, int $wantScale): string
    {
        if ($haveScale > $wantScale) {
            $i = self::intTruncDivPow10($i, $haveScale - $wantScale);
            return self::fromScaled($i, $wantScale);
        }
        return self::fromScaled($i, $haveScale);
    }

    private static function intShift(string $i, int $n): string
    {
        if ($i === '0' || $n === 0) {
            return $i;
        }
        return $i . str_repeat('0', $n);
    }

    private static function intTruncDivPow10(string $i, int $n): string
    {
        $neg = $i[0] === '-';
        $abs = ltrim($i, '-');
        $abs = strlen($abs) <= $n ? '0' : substr($abs, 0, -$n);
        $abs = ltrim($abs, '0');
        if ($abs === '') {
            return '0';
        }
        return ($neg ? '-' : '') . $abs;
    }

    private static function intNeg(string $i): string
    {
        if ($i === '0') {
            return '0';
        }
        return $i[0] === '-' ? substr($i, 1) : '-' . $i;
    }

    private static function absCmp(string $a, string $b): int
    {
        $la = strlen($a);
        $lb = strlen($b);
        if ($la !== $lb) {
            return $la <=> $lb;
        }
        return strcmp($a, $b) <=> 0;
    }

    private static function absAdd(string $a, string $b): string
    {
        $r = '';
        $carry = 0;
        $i = strlen($a) - 1;
        $j = strlen($b) - 1;
        while ($i >= 0 || $j >= 0 || $carry) {
            $s = $carry + ($i >= 0 ? (int) $a[$i--] : 0) + ($j >= 0 ? (int) $b[$j--] : 0);
            $r = ($s % 10) . $r;
            $carry = intdiv($s, 10);
        }
        return ltrim($r, '0') ?: '0';
    }

    /** |a| - |b| where |a| >= |b| */
    private static function absSub(string $a, string $b): string
    {
        $r = '';
        $borrow = 0;
        $i = strlen($a) - 1;
        $j = strlen($b) - 1;
        while ($i >= 0) {
            $d = (int) $a[$i--] - $borrow - ($j >= 0 ? (int) $b[$j--] : 0);
            if ($d < 0) {
                $d += 10;
                $borrow = 1;
            } else {
                $borrow = 0;
            }
            $r = $d . $r;
        }
        return ltrim($r, '0') ?: '0';
    }

    private static function intAdd(string $a, string $b): string
    {
        $na = $a[0] === '-';
        $nb = $b[0] === '-';
        $aa = ltrim($a, '-');
        $ab = ltrim($b, '-');
        if ($na === $nb) {
            $s = self::absAdd($aa, $ab);
            return $na && $s !== '0' ? '-' . $s : $s;
        }
        $c = self::absCmp($aa, $ab);
        if ($c === 0) {
            return '0';
        }
        if ($c > 0) {
            $s = self::absSub($aa, $ab);
            return $na ? '-' . $s : $s;
        }
        $s = self::absSub($ab, $aa);
        return $nb ? '-' . $s : $s;
    }

    private static function intMul(string $a, string $b): string
    {
        $neg = ($a[0] === '-') !== ($b[0] === '-');
        $a = ltrim($a, '-');
        $b = ltrim($b, '-');
        if ($a === '0' || $b === '0') {
            return '0';
        }
        // multiply in base 10^7 chunks to stay inside 64-bit ints
        $ca = array_map('intval', array_reverse(str_split(str_pad($a, (int) ceil(strlen($a) / 7) * 7, '0', STR_PAD_LEFT), 7)));
        $cb = array_map('intval', array_reverse(str_split(str_pad($b, (int) ceil(strlen($b) / 7) * 7, '0', STR_PAD_LEFT), 7)));
        $res = array_fill(0, count($ca) + count($cb), 0);
        foreach ($ca as $i => $x) {
            $carry = 0;
            foreach ($cb as $j => $y) {
                $t = $res[$i + $j] + $x * $y + $carry;
                $res[$i + $j] = $t % 10000000;
                $carry = intdiv($t, 10000000);
            }
            $k = $i + count($cb);
            while ($carry) {
                $t = $res[$k] + $carry;
                $res[$k] = $t % 10000000;
                $carry = intdiv($t, 10000000);
                $k++;
            }
        }
        $out = '';
        foreach (array_reverse($res) as $chunk) {
            $out .= str_pad((string) $chunk, 7, '0', STR_PAD_LEFT);
        }
        $out = ltrim($out, '0') ?: '0';
        return $neg ? '-' . $out : $out;
    }

    /** Truncating integer division. */
    private static function intDiv(string $a, string $b): string
    {
        $neg = ($a[0] === '-') !== ($b[0] === '-');
        $a = ltrim($a, '-');
        $b = ltrim($b, '-');
        if (self::absCmp($a, $b) < 0) {
            return '0';
        }
        $q = '';
        $rem = '0';
        $len = strlen($a);
        for ($i = 0; $i < $len; $i++) {
            $rem = ltrim($rem . $a[$i], '0') ?: '0';
            $d = 0;
            while (self::absCmp($rem, $b) >= 0) {
                $rem = self::absSub($rem, $b);
                $d++;
            }
            $q .= $d;
        }
        $q = ltrim($q, '0') ?: '0';
        return $neg && $q !== '0' ? '-' . $q : $q;
    }
}
