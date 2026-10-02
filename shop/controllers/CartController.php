<?php
final class CartController
{
    public function show(): void
    {
        $summary = CartService::summary();
        View::page('pages/cart', ['s' => $summary], ['title' => 'আমার কার্ট', 'page' => 'cart', 'robots' => 'noindex,follow', 'nav' => 'cart']);
    }
}
