<?php
declare(strict_types=1);

/**
 * A small CBOR (RFC 8949) decoder — enough for WebAuthn attestation objects
 * and COSE keys. Byte and text strings both decode to PHP strings.
 */
final class Cbor
{
    /** Decodes one item starting at $offset and advances $offset past it. */
    public static function decode(string $data, int &$offset = 0, int $depth = 0): mixed
    {
        if ($depth > 16) {
            throw new UnexpectedValueException('CBOR nesting too deep');
        }
        $initial = self::byte($data, $offset);
        $major = $initial >> 5;
        $info = $initial & 0x1F;

        if ($major === 7) {
            return match ($info) {
                20 => false,
                21 => true,
                22, 23 => null,
                25 => self::halfFloat(self::uint($data, $offset, 2)),
                26 => unpack('G', self::take($data, $offset, 4))[1],
                27 => unpack('E', self::take($data, $offset, 8))[1],
                default => throw new UnexpectedValueException('Unsupported CBOR simple value'),
            };
        }

        $arg = self::argument($data, $offset, $info);
        switch ($major) {
            case 0:
                return $arg;
            case 1:
                return -1 - $arg;
            case 2:
            case 3:
                return self::take($data, $offset, $arg);
            case 4:
                $list = [];
                for ($i = 0; $i < $arg; $i++) {
                    $list[] = self::decode($data, $offset, $depth + 1);
                }
                return $list;
            case 5:
                $map = [];
                for ($i = 0; $i < $arg; $i++) {
                    $key = self::decode($data, $offset, $depth + 1);
                    if (!is_int($key) && !is_string($key)) {
                        throw new UnexpectedValueException('Unsupported CBOR map key');
                    }
                    $map[$key] = self::decode($data, $offset, $depth + 1);
                }
                return $map;
            case 6:
                return self::decode($data, $offset, $depth + 1); // tag: keep the tagged value
        }
        throw new UnexpectedValueException('Unsupported CBOR type');
    }

    private static function argument(string $data, int &$offset, int $info): int
    {
        if ($info < 24) {
            return $info;
        }
        $value = match ($info) {
            24 => self::uint($data, $offset, 1),
            25 => self::uint($data, $offset, 2),
            26 => self::uint($data, $offset, 4),
            27 => self::uint($data, $offset, 8),
            default => throw new UnexpectedValueException('Indefinite-length CBOR is not supported'),
        };
        if ($value < 0) {
            throw new UnexpectedValueException('CBOR length out of range');
        }
        return $value;
    }

    private static function uint(string $data, int &$offset, int $bytes): int
    {
        $value = 0;
        foreach (str_split(self::take($data, $offset, $bytes)) as $char) {
            $value = ($value << 8) | ord($char);
        }
        return $value;
    }

    private static function byte(string $data, int &$offset): int
    {
        return ord(self::take($data, $offset, 1));
    }

    private static function take(string $data, int &$offset, int $length): string
    {
        if ($length < 0 || $offset + $length > strlen($data)) {
            throw new UnexpectedValueException('CBOR data is truncated');
        }
        $chunk = substr($data, $offset, $length);
        $offset += $length;
        return $chunk;
    }

    private static function halfFloat(int $half): float
    {
        $exp = ($half >> 10) & 0x1F;
        $mant = $half & 0x3FF;
        $value = match (true) {
            $exp === 0 => $mant * 2 ** -24,
            $exp === 31 => $mant === 0 ? INF : NAN,
            default => ($mant + 1024) * 2 ** ($exp - 25),
        };
        return ($half & 0x8000) ? -$value : $value;
    }
}
