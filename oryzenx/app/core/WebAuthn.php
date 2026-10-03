<?php
/**
 * Minimal WebAuthn (passkey) server: "none" attestation registration and
 * assertion verification for ES256 (P-256) and RS256 credentials.
 */
final class WebAuthn
{
    public static function rpId(): string { return preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'localhost'); }
    public static function origin(): string { return (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'); }

    public static function challenge(string $purpose): string
    {
        $c = random_bytes(32);
        $_SESSION['webauthn'][$purpose] = ['c' => Crypto::b64u($c), 't' => time()];
        return Crypto::b64u($c);
    }

    private static function takeChallenge(string $purpose): string
    {
        $c = $_SESSION['webauthn'][$purpose] ?? null;
        unset($_SESSION['webauthn'][$purpose]);
        if (!$c || time() - $c['t'] > 300) throw new RuntimeException('Challenge expired');
        return $c['c'];
    }

    private static function checkClientData(string $clientDataJSON, string $type, string $purpose): void
    {
        $cd = json_decode($clientDataJSON, true);
        if (($cd['type'] ?? '') !== $type) throw new RuntimeException('Bad type');
        if (!hash_equals(self::takeChallenge($purpose), (string)($cd['challenge'] ?? ''))) throw new RuntimeException('Bad challenge');
        if (($cd['origin'] ?? '') !== self::origin()) throw new RuntimeException('Bad origin');
    }

    /** @return array{credential_id:string, public_key:string, sign_count:int} */
    public static function register(array $p): array
    {
        $clientData = Crypto::b64uDecode((string)($p['clientDataJSON'] ?? ''));
        self::checkClientData($clientData, 'webauthn.create', 'register');
        $att = Cbor::decode(Crypto::b64uDecode((string)($p['attestationObject'] ?? '')));
        $auth = $att['authData'] ?? '';
        if (strlen($auth) < 55) throw new RuntimeException('Bad authData');
        if (!hash_equals(hash('sha256', self::rpId(), true), substr($auth, 0, 32))) throw new RuntimeException('Bad rpId');
        $flags = ord($auth[32]);
        if (!($flags & 0x01)) throw new RuntimeException('User not present');
        if (!($flags & 0x40)) throw new RuntimeException('No credential data');
        $signCount = unpack('N', substr($auth, 33, 4))[1];
        $credLen = unpack('n', substr($auth, 53, 2))[1];
        $credId = substr($auth, 55, $credLen);
        $cose = Cbor::decode(substr($auth, 55 + $credLen), true);
        return ['credential_id' => Crypto::b64u($credId), 'public_key' => self::coseToPem($cose), 'sign_count' => $signCount];
    }

    /** Verifies an assertion against a stored passkey row; returns the new sign count. */
    public static function verifyAssertion(array $p, array $passkey): int
    {
        $clientData = Crypto::b64uDecode((string)($p['clientDataJSON'] ?? ''));
        self::checkClientData($clientData, 'webauthn.get', 'login');
        $auth = Crypto::b64uDecode((string)($p['authenticatorData'] ?? ''));
        if (strlen($auth) < 37 || !hash_equals(hash('sha256', self::rpId(), true), substr($auth, 0, 32))) throw new RuntimeException('Bad rpId');
        if (!(ord($auth[32]) & 0x01)) throw new RuntimeException('User not present');
        $sig = Crypto::b64uDecode((string)($p['signature'] ?? ''));
        $data = $auth . hash('sha256', $clientData, true);
        if (openssl_verify($data, $sig, $passkey['public_key'], OPENSSL_ALGO_SHA256) !== 1) throw new RuntimeException('Bad signature');
        $count = unpack('N', substr($auth, 33, 4))[1];
        if ($count !== 0 && $count <= (int)$passkey['sign_count']) throw new RuntimeException('Cloned authenticator');
        return $count;
    }

    private static function coseToPem(array $k): string
    {
        $kty = $k[1] ?? null;
        if ($kty === 2) { // EC2 P-256
            $x = $k[-2] ?? ''; $y = $k[-3] ?? '';
            if (strlen($x) !== 32 || strlen($y) !== 32) throw new RuntimeException('Bad EC key');
            $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
        } elseif ($kty === 3) { // RSA
            $n = ltrim($k[-1] ?? '', "\0"); $e = ltrim($k[-2] ?? '', "\0");
            if (ord($n[0]) > 0x7f) $n = "\0" . $n;
            if (ord($e[0]) > 0x7f) $e = "\0" . $e;
            $rsa = self::asn1(0x30, self::asn1(0x02, $n) . self::asn1(0x02, $e));
            $der = self::asn1(0x30, hex2bin('300d06092a864886f70d0101010500') . self::asn1(0x03, "\0" . $rsa));
        } else {
            throw new RuntimeException('Unsupported key type');
        }
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function asn1(int $tag, string $v): string
    {
        $l = strlen($v);
        $len = $l < 128 ? chr($l) : ($l < 256 ? "\x81" . chr($l) : "\x82" . pack('n', $l));
        return chr($tag) . $len . $v;
    }
}

/** Minimal CBOR decoder (enough for WebAuthn attestation objects and COSE keys). */
final class Cbor
{
    private string $d; private int $p = 0;

    public static function decode(string $data, bool $allowTrailing = false): mixed
    {
        $c = new self(); $c->d = $data;
        $v = $c->item();
        if (!$allowTrailing && $c->p !== strlen($data)) throw new RuntimeException('CBOR trailing data');
        return $v;
    }

    private function read(int $n): string
    {
        if ($this->p + $n > strlen($this->d)) throw new RuntimeException('CBOR overflow');
        $s = substr($this->d, $this->p, $n); $this->p += $n; return $s;
    }

    private function len(int $info): int
    {
        return match (true) {
            $info < 24 => $info,
            $info === 24 => ord($this->read(1)),
            $info === 25 => unpack('n', $this->read(2))[1],
            $info === 26 => unpack('N', $this->read(4))[1],
            $info === 27 => unpack('J', $this->read(8))[1],
            default => throw new RuntimeException('CBOR unsupported length'),
        };
    }

    private function item(): mixed
    {
        $b = ord($this->read(1)); $major = $b >> 5; $info = $b & 31;
        switch ($major) {
            case 0: return $this->len($info);
            case 1: return -1 - $this->len($info);
            case 2: return $this->read($this->len($info));
            case 3: return $this->read($this->len($info));
            case 4: $n = $this->len($info); $a = []; for ($i = 0; $i < $n; $i++) $a[] = $this->item(); return $a;
            case 5: $n = $this->len($info); $m = []; for ($i = 0; $i < $n; $i++) { $k = $this->item(); $m[$k] = $this->item(); } return $m;
            case 6: $this->len($info); return $this->item();
            case 7:
                return match ($info) { 20 => false, 21 => true, 22, 23 => null,
                    25 => (float)unpack('n', $this->read(2))[1], 26 => unpack('G', $this->read(4))[1], 27 => unpack('E', $this->read(8))[1],
                    default => throw new RuntimeException('CBOR simple') };
        }
        throw new RuntimeException('CBOR type');
    }
}
