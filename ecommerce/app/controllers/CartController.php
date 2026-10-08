<?php
/**
 * Cart page shell. Lines are rendered client-side from the server-priced cart
 * (/api/cart/price) because the cart itself lives in the customer's browser.
 */
final class CartController
{
    public function index(Request $r): Response
    {
        return View::page('pages/cart', [], [
            'title'     => 'শপিং কার্ট',
            'robots'    => 'noindex, nofollow',
            'styles'    => ['cart'],
            'scripts'   => ['cart'],
            'page'      => 'cart',
            'nav'       => 'cart',
            'cacheable' => false,
        ]);
    }
}
