<?php
/**
 * Minimal CBOR (RFC 8949) decoder — enough for WebAuthn attestation objects
 * and COSE keys (maps, arrays, ints, byte/text strings, simple values).
 */
declare(strict_types=1);

final class Cbor
{
    private string $data;
    private int $pos = 0;

    private function __construct(string $data)
    {
        $this->data = $data;
    }

    /** Decode one item; $consumed receives the number of bytes read. */
    public static function decode(string $data, ?int &$consumed = null)
    {
        $d = new self($data);
        $value = $d->item();
        $consumed = $d->pos;
        return $value;
    }

    private function read(int $n): string
    {
        if ($this->pos + $n > strlen($this->data)) {
            throw new RuntimeException('CBOR: unexpected end of data');
        }
        $s = substr($this->data, $this->pos, $n);
        $this->pos += $n;
        return $s;
    }

    private function length(int $info): int
    {
        if ($info < 24) {
            return $info;
        }
        switch ($info) {
            case 24: return ord($this->read(1));
            case 25: return unpack('n', $this->read(2))[1];
            case 26: return unpack('N', $this->read(4))[1];
            case 27: return (int) unpack('J', $this->read(8))[1];
        }
        throw new RuntimeException('CBOR: indefinite lengths are not supported');
    }

    private function item()
    {
        $byte = ord($this->read(1));
        $major = $byte >> 5;
        $info = $byte & 0x1f;
        switch ($major) {
            case 0: return $this->length($info);
            case 1: return -1 - $this->length($info);
            case 2: return ['_bytes' => $this->read($this->length($info))];
            case 3: return $this->read($this->length($info));
            case 4:
                $out = [];
                for ($i = 0, $n = $this->length($info); $i < $n; $i++) {
                    $out[] = $this->item();
                }
                return $out;
            case 5:
                $out = [];
                for ($i = 0, $n = $this->length($info); $i < $n; $i++) {
                    $k = $this->item();
                    $out[is_array($k) ? json_encode($k) : $k] = $this->item();
                }
                return $out;
            case 6:
                $this->length($info);
                return $this->item();
            case 7:
                if ($info === 20) { return false; }
                if ($info === 21) { return true; }
                if ($info === 22 || $info === 23) { return null; }
                if ($info === 25) { $this->read(2); return 0.0; }
                if ($info === 26) { return unpack('G', $this->read(4))[1]; }
                if ($info === 27) { return unpack('E', $this->read(8))[1]; }
        }
        throw new RuntimeException('CBOR: unsupported item');
    }

    public static function bytes($v): string
    {
        return is_array($v) && isset($v['_bytes']) ? $v['_bytes'] : '';
    }
}
