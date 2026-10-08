<?php
declare(strict_types=1);

/** Builds PEM public keys from raw key parameters (COSE keys and JWKs). */
final class Crypto
{
    public static function rsaPem(string $modulus, string $exponent): string
    {
        $rsaKey = self::seq(self::int($modulus) . self::int($exponent));
        $algorithm = self::seq("\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" . "\x05\x00"); // rsaEncryption, NULL
        return self::pem(self::seq($algorithm . self::bitString($rsaKey)));
    }

    /** P-256 key from its 32-byte X and Y coordinates. */
    public static function ecP256Pem(string $x, string $y): string
    {
        if (strlen($x) !== 32 || strlen($y) !== 32) {
            throw new UnexpectedValueException('Bad P-256 coordinates');
        }
        $algorithm = self::seq(
            "\x06\x07\x2a\x86\x48\xce\x3d\x02\x01"      // id-ecPublicKey
            . "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07" // prime256v1
        );
        return self::pem(self::seq($algorithm . self::bitString("\x04" . $x . $y)));
    }

    /**
     * Converts a WebAuthn COSE public key to PEM. Supports ES256 (-7) and RS256 (-257),
     * the two algorithms the server offers when registering a passkey.
     */
    public static function coseToPem(array $cose): string
    {
        $kty = $cose[1] ?? null;
        $alg = $cose[3] ?? null;
        if ($kty === 2 && $alg === -7 && ($cose[-1] ?? null) === 1) {
            return self::ecP256Pem((string) $cose[-2], (string) $cose[-3]);
        }
        if ($kty === 3 && $alg === -257) {
            return self::rsaPem((string) $cose[-1], (string) $cose[-2]);
        }
        throw new UnexpectedValueException('Unsupported passkey algorithm');
    }

    private static function pem(string $der): string
    {
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function seq(string $content): string
    {
        return "\x30" . self::length(strlen($content)) . $content;
    }

    private static function int(string $bytes): string
    {
        $bytes = ltrim($bytes, "\x00");
        if ($bytes === '' || (ord($bytes[0]) & 0x80)) {
            $bytes = "\x00" . $bytes;
        }
        return "\x02" . self::length(strlen($bytes)) . $bytes;
    }

    private static function bitString(string $content): string
    {
        return "\x03" . self::length(strlen($content) + 1) . "\x00" . $content;
    }

    private static function length(int $length): string
    {
        if ($length < 0x80) {
            return chr($length);
        }
        $bytes = ltrim(pack('N', $length), "\x00");
        return chr(0x80 | strlen($bytes)) . $bytes;
    }
}
