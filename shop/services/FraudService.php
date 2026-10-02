<?php
/**
 * Data-based risk status from courier history + this shop's own orders.
 * It never accuses anyone — it only summarises delivery statistics for admin review.
 */
final class FraudService
{
    public static function local(string $phone): array
    {
        $rows = DB::all('SELECT status, COUNT(*) n FROM orders WHERE phone = ? AND deleted_at IS NULL GROUP BY status', [$phone]);
        $by = array_column($rows, 'n', 'status');
        return [
            'total' => array_sum($by), 'delivered' => (int) ($by['delivered'] ?? 0),
            'cancelled' => (int) ($by['cancelled'] ?? 0) + (int) ($by['failed'] ?? 0), 'returned' => (int) ($by['returned'] ?? 0),
        ];
    }

    /** @return array{risk:string, reason:string} */
    public static function classify(int $total, int $delivered): array
    {
        if ($total === 0) {
            return ['risk' => 'new', 'reason' => 'আগের কোনো কুরিয়ার অর্ডার রেকর্ড পাওয়া যায়নি।'];
        }
        $rate = $delivered / $total * 100;
        $min = max(1, (int) setting('fraud_min_orders', 3));
        $text = sprintf('মোট %s অর্ডার, সফল %s (%s%%)', bn_num($total), bn_num($delivered), bn_num(round($rate)));
        if ($total >= $min && $rate < (float) setting('fraud_high_below', 40)) {
            return ['risk' => 'high', 'reason' => $text . ' — সফলতার হার খুব কম।'];
        }
        if ($rate < (float) setting('fraud_review_below', 70)) {
            return ['risk' => 'review', 'reason' => $text . ' — অর্ডার কনফার্মের আগে কল করে যাচাই করুন।'];
        }
        return ['risk' => 'normal', 'reason' => $text . '।'];
    }

    public static function evaluate(string $phone, ?int $orderId = null, bool $force = false): array
    {
        $local = self::local($phone);
        $remote = BDCourierService::configured() ? BDCourierService::check($phone, $force) : ['ok' => false, 'message' => 'BDCourier API key সেট করা নেই।'];
        $source = $remote['ok'] ? $remote['data'] : null;
        $total = $source ? (int) $source['total'] : $local['delivered'] + $local['cancelled'] + $local['returned'];
        $delivered = $source ? (int) $source['delivered'] : $local['delivered'];
        $cls = self::classify($total, $delivered);
        DB::insert('fraud_checks', [
            'order_id' => $orderId, 'phone' => $phone, 'courier_check_id' => $source['id'] ?? null,
            'local_total' => $local['total'], 'local_delivered' => $local['delivered'], 'local_cancelled' => $local['cancelled'],
            'local_returned' => $local['returned'], 'risk_level' => $cls['risk'], 'reason' => mb_substr($cls['reason'], 0, 255),
        ]);
        if ($orderId) {
            DB::update('orders', ['risk_level' => $cls['risk']], 'id = ?', [$orderId]);
            if (in_array($cls['risk'], ['high', 'review'], true)) {
                $code = DB::val('SELECT order_code FROM orders WHERE id = ?', [$orderId]);
                Notifier::add('fraud', 'ফ্রড চেক: ' . risk_label($cls['risk']), "অর্ডার {$code} — " . $cls['reason'], '/admin/orders/' . $orderId);
            }
        }
        return ['risk' => $cls['risk'], 'risk_label' => risk_label($cls['risk']), 'reason' => $cls['reason'], 'local' => $local,
            'courier' => $source, 'courier_error' => $remote['ok'] ? null : ($remote['message'] ?? null), 'cached' => $remote['cached'] ?? false];
    }
}
