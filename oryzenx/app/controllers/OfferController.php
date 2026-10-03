<?php
final class OfferController
{
    public function claim(): void
    {
        if (!Offer::enabled()) fail(t('offer.ended'));
        if (!Auth::id()) { $_SESSION['offer_intent'] = 1; json_out(['ok' => true, 'state' => 'login', 'redirect' => url('/register?claim=1')]); }
        if (!RateLimit::hit('offer|' . client_ip(), 10, 3600)) fail(t('error.429'), [], 429);
        $r = Offer::tryClaim((int)Auth::id());
        $p = num(Offer::percent());
        match ($r) {
            'claimed' => json_out(['ok' => true, 'state' => 'claimed', 'message' => t('offer.claimed_text', ['p' => $p])]),
            'already' => json_out(['ok' => true, 'state' => 'already', 'message' => t('offer.already')]),
            'ip' => json_out(['ok' => false, 'state' => 'ip', 'message' => t('offer.ip_warning')], 409),
            default => fail(t('offer.ended')),
        };
    }
}
