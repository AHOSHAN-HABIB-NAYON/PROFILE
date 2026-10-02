<?php
/** Categories, combos, banners and coupons (CRUD + toggle + sort + trash). */
final class AdminCatalogController extends AdminController
{
    private const TOGGLE = ['categories' => 'categories', 'combos' => 'combos', 'banners' => 'banners', 'coupons' => 'coupons'];
    private const TRASH = ['categories' => 'category', 'combos' => 'combo', 'banners' => 'banner', 'coupons' => 'coupon'];

    public function categories(): void
    {
        $items = DB::all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) products
            FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort_order, c.name');
        View::admin('categories', ['items' => $items], 'ক্যাটাগরি', 'categories');
    }

    public function saveCategory(): void
    {
        $id = Request::int('id');
        $existing = $id ? DB::one('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [$id]) : null;
        $name = Request::str('name');
        if (mb_strlen($name) < 2) {
            Response::fail('ক্যাটাগরির নাম দিন।', ['name' => 'ক্যাটাগরির নাম দিন।']);
        }
        $iconType = Request::str('icon_type') === 'image' ? 'image' : 'fa';
        $icon = preg_replace('/[^a-z0-9\-]/', '', strtolower(Request::str('icon'))) ?: 'tag';
        $image = self::upload('image', 'categories', 160, 'webp');
        if ($iconType === 'image' && !$image && empty($existing['image'])) {
            Response::fail('কাস্টম আইকনের জন্য একটি ছবি আপলোড করুন।', ['image' => 'ছবি দিন']);
        }
        $data = [
            'name' => mb_substr($name, 0, 120), 'icon_type' => $iconType, 'icon' => $icon,
            'is_active' => (int) Request::bool('is_active'), 'sort_order' => Request::int('sort_order', (int) ($existing['sort_order'] ?? 0)),
        ];
        if ($image) {
            $data['image'] = $image;
            ImageProcessor::delete($existing['image'] ?? null);
        }
        if ($existing) {
            if (Request::str('slug') !== '') {
                $data['slug'] = unique_slug('categories', Request::str('slug'), $id);
            }
            DB::update('categories', $data, 'id = ?', [$id]);
        } else {
            $data['slug'] = unique_slug('categories', Request::str('slug') ?: $name);
            $data['sort_order'] = (int) DB::val('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories');
            DB::insert('categories', $data);
        }
        Response::ok(null, $existing ? 'ক্যাটাগরি আপডেট হয়েছে।' : 'ক্যাটাগরি তৈরি হয়েছে।');
    }

    public function combos(): void
    {
        $items = Combo::withItems(DB::all('SELECT * FROM combos WHERE deleted_at IS NULL ORDER BY sort_order, id DESC'));
        View::admin('combos', ['items' => $items], 'কম্বো', 'combos');
    }

    public function saveCombo(): void
    {
        $id = Request::int('id');
        $existing = $id ? DB::one('SELECT * FROM combos WHERE id = ? AND deleted_at IS NULL', [$id]) : null;
        $name = Request::str('name');
        $price = self::money(Request::input('price'));
        $orig = self::money(Request::input('original_price'), true);
        $productIds = array_map('intval', (array) Request::input('product_ids', []));
        $qtys = array_map('intval', (array) Request::input('quantities', []));
        $errors = [];
        if (mb_strlen($name) < 2) $errors['name'] = 'কম্বোর নাম দিন।';
        if ($price <= 0) $errors['price'] = 'সঠিক মূল্য দিন।';
        if (count(array_filter($productIds)) < 1) $errors['product_ids'] = 'কমপক্ষে একটি পণ্য যোগ করুন।';
        if ($errors) {
            Response::fail(reset($errors), $errors);
        }
        $photo = self::photo('image', 'combos', 900);
        if (!$photo && !$existing) {
            Response::fail('কম্বোর ছবি দিন।', ['image' => 'ছবি দিন']);
        }
        if (!$orig) {
            // Auto-calculate original price from the included products.
            $orig = 0.0;
            foreach ($productIds as $i => $pid) {
                $orig += (float) DB::val('SELECT price FROM products WHERE id = ?', [$pid]) * max(1, $qtys[$i] ?? 1);
            }
        }
        $data = [
            'name' => mb_substr($name, 0, 190), 'description' => mb_substr(Request::str('description'), 0, 500) ?: null,
            'price' => $price, 'original_price' => $orig ?: null, 'stock' => max(0, Request::int('stock')),
            'free_delivery' => (int) Request::bool('free_delivery'), 'is_active' => (int) Request::bool('is_active'),
        ];
        if ($photo) {
            $data['image'] = $photo['path'];
            ImageProcessor::delete($existing['image'] ?? null);
        }
        DB::transaction(static function () use (&$id, $existing, $data, $productIds, $qtys, $name) {
            if ($existing) {
                DB::update('combos', $data, 'id = ?', [$id]);
            } else {
                $data['slug'] = unique_slug('combos', $name);
                $id = DB::insert('combos', $data);
            }
            DB::run('DELETE FROM combo_items WHERE combo_id = ?', [$id]);
            foreach ($productIds as $i => $pid) {
                if ($pid > 0 && DB::val('SELECT id FROM products WHERE id = ?', [$pid])) {
                    DB::insert('combo_items', ['combo_id' => $id, 'product_id' => $pid, 'quantity' => max(1, min(99, $qtys[$i] ?? 1))]);
                }
            }
        });
        Response::ok(null, $existing ? 'কম্বো আপডেট হয়েছে।' : 'কম্বো তৈরি হয়েছে।');
    }

    public function banners(): void
    {
        View::admin('banners', ['items' => DB::all('SELECT * FROM banners WHERE deleted_at IS NULL ORDER BY sort_order, id')], 'ব্যানার', 'banners');
    }

    public function saveBanner(): void
    {
        $id = Request::int('id');
        $existing = $id ? DB::one('SELECT * FROM banners WHERE id = ? AND deleted_at IS NULL', [$id]) : null;
        $photo = self::photo('image', 'banners', 1600);
        if (!$photo && !$existing) {
            Response::fail('ব্যানারের ছবি দিন।', ['image' => 'ছবি দিন']);
        }
        $link = Request::str('link');
        if ($link !== '' && !preg_match('#^(/|https?://)#i', $link)) {
            Response::fail('লিংক "/" অথবা "https://" দিয়ে শুরু হতে হবে।', ['link' => 'অবৈধ লিংক']);
        }
        $data = [
            'title' => mb_substr(Request::str('title'), 0, 190) ?: null, 'subtitle' => mb_substr(Request::str('subtitle'), 0, 255) ?: null,
            'link' => $link ?: null, 'cta_text' => mb_substr(Request::str('cta_text'), 0, 60) ?: null, 'is_active' => (int) Request::bool('is_active'),
        ];
        if ($photo) {
            $data += ['image' => $photo['path'], 'width' => $photo['width'], 'height' => $photo['height']];
            ImageProcessor::delete($existing['image'] ?? null);
        }
        if ($existing) {
            DB::update('banners', $data, 'id = ?', [$id]);
        } else {
            $data['sort_order'] = (int) DB::val('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM banners');
            DB::insert('banners', $data);
        }
        Response::ok(null, $existing ? 'ব্যানার আপডেট হয়েছে।' : 'ব্যানার যোগ হয়েছে।');
    }

    public function coupons(): void
    {
        View::admin('coupons', ['items' => DB::all('SELECT * FROM coupons WHERE deleted_at IS NULL ORDER BY id DESC')], 'কুপন', 'coupons');
    }

    public function saveCoupon(): void
    {
        $id = Request::int('id');
        $code = mb_strtoupper(preg_replace('/\s+/', '', Request::str('code')) ?? '');
        $type = Request::str('type') === 'fixed' ? 'fixed' : 'percent';
        $value = self::money(Request::input('value'));
        $errors = [];
        if (!preg_match('/^[A-Z0-9_\-]{3,40}$/', $code)) $errors['code'] = 'কোড ৩-৪০ অক্ষরের (ইংরেজি অক্ষর/সংখ্যা) হতে হবে।';
        elseif (DB::val('SELECT id FROM coupons WHERE code = ? AND id <> ?', [$code, $id])) $errors['code'] = 'এই কোড আগে থেকেই আছে।';
        if ($value <= 0 || ($type === 'percent' && $value > 100)) $errors['value'] = 'সঠিক ডিসকাউন্ট দিন।';
        $start = self::dt(Request::str('starts_at'));
        $end = self::dt(Request::str('expires_at'));
        if ($start && $end && strtotime($end) <= strtotime($start)) $errors['expires_at'] = 'মেয়াদ শুরুর সময়ের পরে হতে হবে।';
        if ($errors) {
            Response::fail(reset($errors), $errors);
        }
        $data = [
            'code' => $code, 'type' => $type, 'value' => $value, 'min_order' => self::money(Request::input('min_order')),
            'max_discount' => self::money(Request::input('max_discount'), true), 'starts_at' => $start, 'expires_at' => $end,
            'usage_limit' => Request::str('usage_limit') === '' ? null : max(1, Request::int('usage_limit')),
            'is_highlighted' => (int) Request::bool('is_highlighted'), 'is_active' => (int) Request::bool('is_active'),
        ];
        $id ? DB::update('coupons', $data, 'id = ?', [$id]) : DB::insert('coupons', $data);
        Response::ok(null, $id ? 'কুপন আপডেট হয়েছে।' : 'কুপন তৈরি হয়েছে।');
    }

    public function toggle(string $entity, string $id): void
    {
        $table = self::TOGGLE[$entity] ?? null;
        if (!$table) {
            Response::notFound();
        }
        $field = $entity === 'coupons' && Request::str('field') === 'is_highlighted' ? 'is_highlighted' : 'is_active';
        DB::run("UPDATE `{$table}` SET `{$field}` = 1 - `{$field}` WHERE id = ?", [$this->id($id)]);
        Response::ok(null, 'আপডেট হয়েছে।');
    }

    public function trash(string $entity, string $id): void
    {
        $e = self::TRASH[$entity] ?? null;
        if (!$e) {
            Response::notFound();
        }
        TrashService::trash($e, $this->id($id)) ? Response::ok(null, 'ট্র্যাশে পাঠানো হয়েছে। ট্র্যাশ থেকে ফিরিয়ে আনা যাবে।') : Response::fail('মুছে ফেলা যায়নি।');
    }

    public function sort(string $entity): void
    {
        $table = self::TOGGLE[$entity] ?? null;
        if (!$table || $entity === 'coupons') {
            Response::notFound();
        }
        foreach (array_values((array) Request::input('order', [])) as $i => $rowId) {
            DB::run("UPDATE `{$table}` SET sort_order = ? WHERE id = ?", [$i, (int) $rowId]);
        }
        Response::ok(null, 'ক্রম সংরক্ষিত হয়েছে।');
    }
}
