<?php
/** Target of a scanned "receive money" QR (/qr/pay/{uid}) → transfer form. */
$to = preg_replace('/[^0-9]/', '', (string) ($params['uid'] ?? ''));
redirect('/wallet/transfer?to=' . rawurlencode($to));
