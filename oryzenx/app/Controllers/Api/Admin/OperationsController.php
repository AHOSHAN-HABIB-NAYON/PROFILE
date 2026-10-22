<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api\Admin;

use OryzenX\Controllers\Controller;
use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Core\Validator;
use OryzenX\Services\AuditService;
use OryzenX\Services\MailService;
use OryzenX\Services\MarketService;
use OryzenX\Services\PushService;
use OryzenX\Services\SalaryService;
use OryzenX\Services\SupportService;
use OryzenX\Services\UploadService;

/** Salary, payment methods, assets/market, notifications and support for administrators. */
final class OperationsController extends Controller
{
    public function __construct(
        private Database $db,
        private SalaryService $salary,
        private MarketService $market,
        private MailService $mail,
        private PushService $push,
        private SupportService $support,
        private UploadService $uploads,
        private AuditService $audit
    ) {
    }

    // ---------------------------------------------------------------- salary
    public function schedules(Request $req): Response
    {
        $rows = $this->db->all(
            'SELECT s.*, u.full_name AS user_name, u.email AS user_email, pm.name AS payment_method_name FROM salary_schedules s
             JOIN users u ON u.id = s.user_id LEFT JOIN payment_methods pm ON pm.id = s.payment_method_id ORDER BY s.is_active DESC, u.full_name'
        );
        return Response::ok($rows);
    }

    public function saveSchedule(Request $req): Response
    {
        $d = Validator::make($req->json(), [
            'user_id' => 'required|int',
            'amount' => 'required|decimal|gt:0',
            'currency' => 'required|in:' . implode(',', SalaryService::CURRENCIES),
            'pay_day' => 'required|int',
            'payment_method_id' => 'nullable|int',
            'start_date' => 'required|date',
            'end_date' => 'nullable|date',
            'is_active' => 'bool',
            'notes' => 'nullable|string|max:500',
        ])->validated();
        return Response::ok($this->salary->upsertSchedule((int) $d['user_id'], $d, $this->uid($req)));
    }

    public function salaryRecords(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->salary->records(null, $this->filters($req, ['user_id', 'status', 'period', 'from', 'to']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function generateSalary(Request $req): Response
    {
        $n = $this->salary->generateForPeriod($req->str('period'), $this->uid($req));
        return Response::ok(['created' => $n]);
    }

    public function updateSalaryRecord(Request $req): Response
    {
        $d = Validator::make($req->json(), [
            'status' => 'required|in:pending,processed,paid,rejected',
            'actual_amount' => 'nullable|decimal|gt:0',
            'usd_rate' => 'nullable|decimal|gt:0',
            'payment_date' => 'nullable|date',
            'payment_method_id' => 'nullable|int',
            'reference' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:500',
        ])->validated();
        return Response::ok($this->salary->updateRecord($this->id($req), array_filter($d, fn ($v) => $v !== null), $this->uid($req)));
    }

    public function exportSalary(Request $req): Response
    {
        [$rows] = $this->salary->records(null, $this->filters($req, ['user_id', 'status', 'period', 'from', 'to']), 1, 10000);
        $this->audit->log($this->uid($req), 'salary.export', 'salary_records', null, ['rows' => count($rows)]);
        return $this->csv('oryzenx-salary-' . gmdate('Ymd') . '.csv', ['id', 'user', 'period', 'expected', 'actual', 'currency', 'usd_rate', 'status', 'due_date', 'payment_date', 'method', 'reference'],
            array_map(fn ($r) => [$r['id'], $r['user_email'], $r['period'], $r['expected_amount'], $r['actual_amount'], $r['currency'], $r['usd_rate'], $r['status'], $r['due_date'], $r['payment_date'], $r['payment_method_name'], $r['reference']], $rows));
    }

    public function userPaymentDetails(Request $req): Response
    {
        return Response::ok($this->salary->userPaymentDetails($this->id($req)));
    }

    public function revealPaymentDetails(Request $req): Response
    {
        return Response::ok($this->salary->revealPaymentDetails($this->id($req), (int) ($req->params['method'] ?? 0), $this->uid($req)));
    }

    // ---------------------------------------------------------------- payment methods
    public function paymentMethods(Request $req): Response
    {
        return Response::ok($this->salary->paymentMethods(false));
    }

    public function updatePaymentMethod(Request $req): Response
    {
        $this->salary->updatePaymentMethod($this->id($req), $req->json(), $this->uid($req));
        return Response::ok($this->salary->paymentMethods(false));
    }

    public function uploadPaymentLogo(Request $req): Response
    {
        $pm = $this->db->one('SELECT logo_path FROM payment_methods WHERE id = :id', ['id' => $this->id($req)]);
        if (!$pm) {
            throw HttpException::notFound();
        }
        $stored = $this->uploads->store($req->files['logo'] ?? [], 'logo', 'logos');
        $this->salary->updatePaymentMethod($this->id($req), ['logo_path' => $stored['path']], $this->uid($req));
        $this->uploads->delete($pm['logo_path']);
        return Response::ok($this->salary->paymentMethods(false));
    }

    // ---------------------------------------------------------------- assets & market
    public function assets(Request $req): Response
    {
        $rows = $this->db->all('SELECT * FROM assets ORDER BY sort_order, symbol');
        $latest = $this->market->latest();
        foreach ($rows as &$r) {
            $r['latest'] = $latest[(int) $r['id']] ?? null;
            $r['holders'] = (int) $this->db->value('SELECT COUNT(*) FROM investment_positions WHERE asset_id = :a AND quantity > 0', ['a' => $r['id']]);
        }
        return Response::ok(['assets' => $rows, 'status' => $this->market->status(), 'providers' => MarketService::availableProviders()]);
    }

    public function saveAsset(Request $req): Response
    {
        $id = $this->id($req) ?: null;
        $d = Validator::make($req->json(), [
            'symbol' => $id ? 'nullable|symbol' : 'required|symbol',
            'name' => 'required|string|min:2|max:80',
            'coingecko_id' => 'nullable|regex:/^[a-z0-9-]{2,80}$/',
            'binance_symbol' => 'nullable|regex:/^[A-Z0-9]{4,30}$/',
            'price_decimals' => 'required|int',
            'quantity_decimals' => 'required|int',
            'color' => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'is_active' => 'bool',
            'sort_order' => 'nullable|int',
        ])->validated();
        $row = [
            'name' => strip_tags($d['name']), 'coingecko_id' => $d['coingecko_id'], 'binance_symbol' => $d['binance_symbol'],
            'price_decimals' => max(0, min(18, (int) $d['price_decimals'])), 'quantity_decimals' => max(0, min(18, (int) $d['quantity_decimals'])),
            'color' => $d['color'], 'is_active' => $d['is_active'] ? 1 : 0, 'sort_order' => (int) ($d['sort_order'] ?? 100), 'updated_at' => Database::now(),
        ];
        if ($id) {
            // the symbol is immutable once created (financial records reference it)
            $this->db->update('assets', $row, 'id = :id', ['id' => $id]);
        } else {
            if ($this->db->value('SELECT id FROM assets WHERE symbol = :s', ['s' => $d['symbol']])) {
                throw HttpException::validation(['symbol' => 'This symbol already exists.']);
            }
            $id = $this->db->insert('assets', $row + ['symbol' => $d['symbol'], 'created_at' => Database::now()]);
        }
        $this->audit->log($this->uid($req), 'asset.saved', 'asset', $id, $row);
        return $this->assets($req);
    }

    public function uploadAssetLogo(Request $req): Response
    {
        $a = $this->db->one('SELECT logo_path FROM assets WHERE id = :id', ['id' => $this->id($req)]);
        if (!$a) {
            throw HttpException::notFound();
        }
        $stored = $this->uploads->store($req->files['logo'] ?? [], 'logo', 'assets');
        $this->db->update('assets', ['logo_path' => $stored['path'], 'updated_at' => Database::now()], 'id = :id', ['id' => $this->id($req)]);
        $this->uploads->delete($a['logo_path']);
        $this->audit->log($this->uid($req), 'asset.logo_uploaded', 'asset', $this->id($req));
        return $this->assets($req);
    }

    public function refreshPrices(Request $req): Response
    {
        $this->audit->log($this->uid($req), 'market.manual_refresh', 'market');
        return Response::ok($this->market->refresh() + ['status' => $this->market->status()]);
    }

    // ---------------------------------------------------------------- email & push
    public function emailQueue(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        $f = $this->filters($req, ['status', 'q']);
        $where = ['1=1'];
        $p = [];
        if (!empty($f['status']) && in_array($f['status'], ['queued', 'sending', 'sent', 'failed', 'cancelled'], true)) {
            $where[] = 'status = :s';
            $p['s'] = $f['status'];
        }
        if (!empty($f['q'])) {
            $where[] = '(to_email LIKE :q OR subject LIKE :q)';
            $p['q'] = '%' . $f['q'] . '%';
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM email_queue WHERE $w", $p);
        $rows = $this->db->all("SELECT id, to_email, subject, template, status, attempts, max_attempts, next_attempt_at, last_error, sent_at, created_at FROM email_queue WHERE $w ORDER BY id DESC LIMIT :l OFFSET :o", $p + ['l' => $per, 'o' => ($page - 1) * $per]);
        return Response::ok($rows, ['page' => $page, 'per_page' => $per, 'total' => $total, 'stats' => $this->mail->stats(), 'configured' => $this->mail->smtpConfigured()]);
    }

    public function emailLogs(Request $req): Response
    {
        $id = $this->id($req);
        return Response::ok($this->db->all('SELECT status, detail, created_at FROM email_logs WHERE email_queue_id = :id ORDER BY id', ['id' => $id]));
    }

    public function emailRetry(Request $req): Response
    {
        return Response::ok(['retried' => $this->mail->retry($this->id($req))]);
    }

    public function emailCancel(Request $req): Response
    {
        return Response::ok(['cancelled' => $this->mail->cancel($this->id($req))]);
    }

    public function processQueue(Request $req): Response
    {
        return Response::ok($this->mail->processQueue(25));
    }

    public function testEmail(Request $req): Response
    {
        $to = $req->str('to');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw HttpException::validation(['to' => 'Enter a valid recipient email.']);
        }
        $this->audit->log($this->uid($req), 'smtp.test', 'smtp', null, ['to' => $to]);
        return Response::ok($this->mail->sendTest($to));
    }

    public function pushLogs(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        $total = (int) $this->db->value('SELECT COUNT(*) FROM push_logs');
        $rows = $this->db->all('SELECT pl.*, u.email FROM push_logs pl LEFT JOIN users u ON u.id = pl.user_id ORDER BY pl.id DESC LIMIT :l OFFSET :o', ['l' => $per, 'o' => ($page - 1) * $per]);
        return Response::ok($rows, ['page' => $page, 'per_page' => $per, 'total' => $total, 'configured' => $this->push->configured(),
            'devices' => (int) $this->db->value('SELECT COUNT(*) FROM push_tokens WHERE invalidated_at IS NULL')]);
    }

    public function testPush(Request $req): Response
    {
        $uid = $req->int('user_id') ?: $this->uid($req);
        $r = $this->push->sendToUser($uid, 'OryzenX', 'Test notification from the admin panel.', ['type' => 'test'], 'test:' . $uid . ':' . microtime(true));
        $this->audit->log($this->uid($req), 'push.test', 'user', $uid, $r);
        $msg = !$this->push->configured() ? 'Firebase is not configured — nothing was sent.' : ($r['sent'] + $r['failed'] + $r['skipped'] === 0 ? 'This account has no registered devices.' : "Sent {$r['sent']}, failed {$r['failed']}.");
        return Response::ok($r + ['message' => $msg]);
    }

    // ---------------------------------------------------------------- support
    public function supportList(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->support->list($this->filters($req, ['status', 'q']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function supportUpdate(Request $req): Response
    {
        $this->support->update($this->id($req), $req->str('status'), $req->str('admin_note') ?: null, $this->uid($req));
        return Response::ok(['updated' => true]);
    }
}
