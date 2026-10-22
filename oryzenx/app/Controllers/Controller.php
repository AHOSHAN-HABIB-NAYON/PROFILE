<?php
declare(strict_types=1);

namespace OryzenX\Controllers;

use OryzenX\Core\App;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Services\SettingsService;

abstract class Controller
{
    protected function user(Request $req): array
    {
        $u = $req->attrs['user'] ?? null;
        if (!$u) {
            throw HttpException::unauthorized();
        }
        return $u;
    }

    protected function uid(Request $req): int
    {
        return (int) $this->user($req)['id'];
    }

    /** @return array{0:int,1:int} page, perPage */
    protected function paging(Request $req, int $default = 20, int $max = 100): array
    {
        $page = max(1, $req->int('page', 1));
        $per = min($max, max(1, $req->int('per_page', $default)));
        return [$page, $per];
    }

    protected function paged(array $rows, int $total, int $page, int $per): Response
    {
        return Response::ok($rows, ['page' => $page, 'per_page' => $per, 'total' => $total, 'pages' => (int) ceil($total / max(1, $per))]);
    }

    /** Filters from the query string limited to an allow-list. */
    protected function filters(Request $req, array $keys): array
    {
        $out = [];
        foreach ($keys as $k) {
            $v = $req->query[$k] ?? null;
            if (is_scalar($v) && trim((string) $v) !== '') {
                $out[$k] = mb_substr(trim((string) $v), 0, 100);
            }
        }
        return $out;
    }

    /**
     * Converts a client datetime to UTC "Y-m-d H:i:s". Values with an explicit offset/Z are honoured;
     * naive values ("2026-10-22T14:30") are interpreted in the configured business timezone.
     */
    protected function toUtc(?string $value, ?string $field = 'date'): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }
        $value = trim($value);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/', $value)) {
            throw HttpException::validation([$field => 'Enter a valid date and time.']);
        }
        $tz = App::get(SettingsService::class)->timezone();
        try {
            $d = new \DateTimeImmutable($value, $tz);
        } catch (\Exception) {
            throw HttpException::validation([$field => 'Enter a valid date and time.']);
        }
        $utc = $d->setTimezone(new \DateTimeZone('UTC'));
        if ($utc->getTimestamp() > time() + 300) {
            throw HttpException::validation([$field => 'Date cannot be in the future.']);
        }
        if ((int) $utc->format('Y') < 2009) {
            throw HttpException::validation([$field => 'Date is too far in the past.']);
        }
        return $utc->format('Y-m-d H:i:s');
    }

    protected function reason(Request $req): string
    {
        $r = $req->str('reason');
        if (mb_strlen($r) < 5) {
            throw HttpException::validation(['reason' => 'Enter a reason (at least 5 characters). It is stored in the audit log.']);
        }
        return mb_substr(strip_tags($r), 0, 500);
    }

    protected function id(Request $req, string $key = 'id'): int
    {
        return (int) ($req->params[$key] ?? 0);
    }

    /** Streams a CSV export. Values starting with = + - @ are prefixed to prevent spreadsheet formula injection. */
    protected function csv(string $filename, array $header, iterable $rows): Response
    {
        $fh = fopen('php://temp', 'w+');
        fwrite($fh, "\xEF\xBB\xBF");
        fputcsv($fh, $header);
        foreach ($rows as $r) {
            fputcsv($fh, array_map(function ($v) {
                $s = (string) ($v ?? '');
                return $s !== '' && in_array($s[0], ['=', '+', '-', '@', "\t", "\r"], true) && !is_numeric($s) ? "'" . $s : $s;
            }, $r));
        }
        rewind($fh);
        $body = (string) stream_get_contents($fh);
        fclose($fh);
        return new Response($body, 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '', $filename) . '"',
            'Cache-Control' => 'no-store',
        ]);
    }

    protected function file(string $path, string $mime, ?string $downloadName = null): Response
    {
        $headers = ['Content-Type' => $mime, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'Content-Security-Policy' => "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"];
        if ($downloadName) {
            $headers['Content-Disposition'] = 'attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '', $downloadName) . '"';
        }
        return new Response((string) file_get_contents($path), 200, $headers);
    }
}
