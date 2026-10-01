<?php
/**
 * POST /payment/binance-pay/webhook — Binance Pay order notifications.
 * Signature is verified with Binance's public certificate before anything is trusted.
 */
declare(strict_types=1);

$body = (string) file_get_contents('php://input');
$headers = [];
foreach ($_SERVER as $k => $v) {
    if (str_starts_with($k, 'HTTP_')) {
        $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
    }
}
header('Content-Type: application/json');
if (BinancePay::mode() !== 'api' || !BinancePay::verifyWebhook($body, $headers)) {
    Logger::write('BINANCE', 'Webhook rejected (signature/mode)', ['ip' => client_ip()]);
    http_response_code(401);
    echo json_encode(['returnCode' => 'FAIL', 'returnMessage' => 'invalid signature']);
    exit;
}
$payload = json_decode($body, true);
if (is_array($payload)) {
    BinancePay::handleWebhook($payload);
}
echo json_encode(['returnCode' => 'SUCCESS', 'returnMessage' => null]);
