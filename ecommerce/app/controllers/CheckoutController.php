<?php
/**
 * Checkout page (no login, Cash on Delivery only).
 * If this browser placed an order before, the form is pre-filled server-side
 * from the customer linked to the device cookie — never from a typed phone alone.
 */
final class CheckoutController
{
    public function index(Request $r): Response
    {
        $saved = Customer::forDevice(device_hash())[0] ?? null;
        Analytics::record('checkout', 1);
        return View::page('pages/checkout', [
            'saved'     => $saved,
            'districts' => config('districts'),
            'event_id'  => Tracking::eventId('InitiateCheckout'),
        ], [
            'title'     => 'চেকআউট',
            'robots'    => 'noindex, nofollow',
            'styles'    => ['checkout'],
            'scripts'   => ['checkout'],
            'page'      => 'checkout',
            'nav'       => 'cart',
            'cacheable' => false,
        ]);
    }
}
