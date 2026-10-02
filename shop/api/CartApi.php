<?php
final class CartApi
{
    private function respond(string $message = '', bool $success = true, array $extra = []): never
    {
        $s = CartService::summary();
        Response::json($success, $message, $extra + [
            'count' => $s['count'],
            'summary' => CartService::forClient($s),
            'html' => View::render('components/cart-content', ['s' => $s]),
        ]);
    }

    public function get(): void
    {
        $this->respond();
    }

    public function add(): void
    {
        if (!RateLimiter::hit('cart:' . Request::ip(), 120, 60)) {
            Response::fail('অনেক বেশি অনুরোধ। একটু পরে চেষ্টা করুন।', [], 429);
        }
        $type = Request::str('type') === 'combo' ? 'combo' : 'product';
        $id = Request::int('id');
        $size = Request::str('size') ?: null;
        $qty = Request::int('qty', 1);
        if ($err = CartService::add($type, $id, $size, $qty)) {
            Response::fail($err, $err === 'দয়া করে সাইজ নির্বাচন করুন।' ? ['size' => $err] : []);
        }
        $eventId = 'atc-' . bin2hex(random_bytes(6));
        $price = 0.0;
        if ($type === 'product' && ($p = Product::find($id))) {
            $price = $p['effective_price'];
            Analytics::event('add_to_cart', $id, $price * $qty);
        } elseif ($type === 'combo' && ($c = Combo::find($id))) {
            $price = (float) $c['price'];
            Analytics::event('add_to_cart', null, $price * $qty);
        }
        $contentId = ($type === 'combo' ? 'combo-' : '') . $id;
        MetaCapi::queue('AddToCart', $eventId, ['currency' => 'BDT', 'value' => $price * $qty, 'content_ids' => [$contentId], 'content_type' => 'product']);
        $this->respond('কার্টে যোগ করা হয়েছে।', true, ['track' => ['event_id' => $eventId, 'value' => $price * $qty, 'content_id' => $contentId]]);
    }

    public function update(): void
    {
        if ($err = CartService::update(Request::str('key'), Request::int('qty'))) {
            $this->respond($err, false);
        }
        $this->respond();
    }

    public function remove(): void
    {
        CartService::remove(Request::str('key'));
        $this->respond('কার্ট থেকে সরানো হয়েছে।');
    }

    public function coupon(): void
    {
        if (!RateLimiter::hit('coupon:' . Request::ip(), 20, 600)) {
            Response::fail('অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', [], 429);
        }
        $code = Request::str('code');
        if ($code === '' || Request::bool('remove')) {
            CartService::setCoupon(null);
            $this->respond('কুপন সরানো হয়েছে।');
        }
        $s = CartService::summary();
        $ev = CouponService::evaluate($code, $s['subtotal']);
        if ($ev['error']) {
            Response::fail($ev['error'], ['coupon' => $ev['error']]);
        }
        CartService::setCoupon($code);
        $this->respond('কুপন প্রয়োগ হয়েছে! ' . money($ev['discount']) . ' ছাড়।');
    }
}
