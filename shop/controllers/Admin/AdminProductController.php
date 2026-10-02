<?php
final class AdminProductController extends AdminController
{
    public function index(): void
    {
        $q = mb_substr(Request::query('q'), 0, 60);
        $cat = (int) Request::query('category');
        $filter = Request::query('filter');
        $page = max(1, (int) Request::query('page', '1'));
        $per = 20;
        $where = ['p.deleted_at IS NULL'];
        $params = [];
        if ($q !== '') {
            $where[] = '(p.name LIKE ? OR p.sku = ?)';
            array_push($params, '%' . addcslashes($q, '%_\\') . '%', $q);
        }
        if ($cat) {
            $where[] = 'p.category_id = ?';
            $params[] = $cat;
        }
        $threshold = (int) setting('low_stock_threshold', 10);
        match ($filter) {
            'inactive' => $where[] = 'p.is_active = 0',
            'featured' => $where[] = 'p.is_featured = 1',
            'flash'    => $where[] = 'p.is_flash = 1',
            'low'      => $where[] = 'p.stock <= COALESCE(p.low_stock_threshold, ' . $threshold . ')',
            'out'      => $where[] = 'p.stock <= 0',
            default    => null,
        };
        $w = implode(' AND ', $where);
        $total = (int) DB::val("SELECT COUNT(*) FROM products p WHERE {$w}", $params);
        $items = DB::all("SELECT p.*, c.name category_name,
            (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) image
            FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE {$w} ORDER BY p.id DESC LIMIT {$per} OFFSET " . (($page - 1) * $per), $params);
        View::admin('products', compact('items', 'total', 'page', 'q', 'cat', 'filter', 'threshold') + ['pages' => (int) ceil($total / $per), 'categories' => Category::options()], 'পণ্য', 'products');
    }

    public function form(?string $id = null): void
    {
        $p = null;
        if ($id !== null) {
            $p = DB::one('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [$this->id($id)]);
            if (!$p) {
                Response::notFound();
            }
        }
        $pid = (int) ($p['id'] ?? 0);
        View::admin('product-form', [
            'p' => $p,
            'images' => $pid ? Product::images($pid) : [],
            'sizes' => $pid ? Product::sizes($pid) : [],
            'related' => $pid ? DB::all('SELECT p.id, p.name FROM product_related r JOIN products p ON p.id = r.related_id WHERE r.product_id = ?', [$pid]) : [],
            'categories' => Category::options(),
        ], $p ? 'পণ্য সম্পাদনা' : 'নতুন পণ্য', 'product-form');
    }

    public function save(): void
    {
        $id = Request::int('id');
        $existing = $id ? DB::one('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [$id]) : null;
        if ($id && !$existing) {
            Response::fail('পণ্য পাওয়া যায়নি।', [], 404);
        }
        $name = Request::str('name');
        $price = self::money(Request::input('price'));
        $old = self::money(Request::input('old_price'), true);
        $discount = Request::input('discount_percent');
        if ($old === null && is_numeric($discount) && (float) $discount > 0 && (float) $discount < 100) {
            // Admin entered a discount % instead of an old price → derive the compare price.
            $old = round($price / (1 - (float) $discount / 100));
        }
        $errors = [];
        if (mb_strlen($name) < 2) $errors['name'] = 'পণ্যের নাম দিন।';
        if ($price <= 0) $errors['price'] = 'সঠিক মূল্য দিন।';
        if ($old !== null && $old > 0 && $old < $price) $errors['old_price'] = 'পুরাতন মূল্য বর্তমান মূল্যের চেয়ে বেশি হতে হবে।';
        $isFlash = Request::bool('is_flash');
        $flashPrice = self::money(Request::input('flash_price'), true);
        if ($isFlash && ($flashPrice === null || $flashPrice <= 0 || $flashPrice >= $price)) $errors['flash_price'] = 'ফ্ল্যাশ মূল্য বর্তমান মূল্যের চেয়ে কম হতে হবে।';
        $sku = Request::str('sku');
        if ($sku !== '' && DB::val('SELECT id FROM products WHERE sku = ? AND id <> ? AND deleted_at IS NULL', [$sku, $id])) $errors['sku'] = 'এই SKU আগে ব্যবহার হয়েছে।';
        if ($errors) {
            Response::fail(reset($errors), $errors);
        }
        $catId = Request::int('category_id') ?: null;
        if ($catId && !DB::val('SELECT id FROM categories WHERE id = ?', [$catId])) {
            $catId = null;
        }
        $slugInput = Request::str('slug');
        $ogUpload = self::upload('og_image_file', 'products', 1200, 'jpg');
        $data = [
            'name' => mb_substr($name, 0, 190),
            'slug' => $slugInput !== '' ? unique_slug('products', $slugInput, $id ?: null) : ($existing['slug'] ?? unique_slug('products', $name)),
            'sku' => $sku !== '' ? mb_substr($sku, 0, 60) : null,
            'category_id' => $catId,
            'short_description' => mb_substr(Request::str('short_description'), 0, 500) ?: null,
            'description' => HtmlSanitizer::clean((string) Request::input('description', '')) ?: null,
            'price' => $price, 'old_price' => $old ?: null,
            'stock' => max(0, Request::int('stock', (int) ($existing['stock'] ?? 0))),
            'low_stock_threshold' => Request::str('low_stock_threshold') === '' ? null : max(0, Request::int('low_stock_threshold')),
            'free_delivery' => (int) Request::bool('free_delivery'), 'is_featured' => (int) Request::bool('is_featured'),
            'is_flash' => (int) $isFlash, 'flash_price' => $isFlash ? $flashPrice : ($existing['flash_price'] ?? null),
            'flash_start' => self::dt(Request::str('flash_start')), 'flash_end' => self::dt(Request::str('flash_end')),
            'is_combo_eligible' => (int) Request::bool('is_combo_eligible'), 'is_active' => (int) Request::bool('is_active'),
            'seo_title' => mb_substr(Request::str('seo_title'), 0, 190) ?: null,
            'seo_description' => mb_substr(Request::str('seo_description'), 0, 400) ?: null,
            'seo_keywords' => mb_substr(Request::str('seo_keywords'), 0, 400) ?: null,
        ];
        if ($ogUpload) {
            $data['og_image'] = $ogUpload;
            ImageProcessor::delete($existing['og_image'] ?? null);
        } elseif (Request::bool('remove_og_image')) {
            $data['og_image'] = null;
            ImageProcessor::delete($existing['og_image'] ?? null);
        }
        $sizes = array_values(array_filter(array_map(static fn ($s) => mb_substr(trim((string) $s), 0, 40), (array) Request::input('sizes', [])), static fn ($s) => $s !== ''));
        $unavailable = array_map('strval', (array) Request::input('sizes_unavailable', []));
        $related = array_slice(array_values(array_unique(array_filter(array_map('intval', (array) Request::input('related', []))))), 0, 12);

        $pid = DB::transaction(static function () use ($id, $data, $sizes, $unavailable, $related) {
            if ($id) {
                DB::update('products', $data, 'id = ?', [$id]);
            } else {
                $id = DB::insert('products', $data);
            }
            DB::run('DELETE FROM product_sizes WHERE product_id = ?', [$id]);
            foreach (array_unique($sizes) as $i => $s) {
                DB::insert('product_sizes', ['product_id' => $id, 'size' => $s, 'is_available' => (int) !in_array($s, $unavailable, true), 'sort_order' => $i]);
            }
            DB::run('DELETE FROM product_related WHERE product_id = ?', [$id]);
            foreach ($related as $rid) {
                if ($rid !== $id && DB::val('SELECT id FROM products WHERE id = ?', [$rid])) {
                    DB::insert('product_related', ['product_id' => $id, 'related_id' => $rid]);
                }
            }
            return $id;
        });
        StockService::notifyLow([$pid]);
        Response::json(true, $id ? 'পণ্য আপডেট হয়েছে।' : 'পণ্য তৈরি হয়েছে।', ['id' => $pid, 'url' => '/product/' . rawurlencode($data['slug'])], [], $id ? null : '/admin/products/' . $pid . '/edit');
    }

    public function uploadImages(string $id): void
    {
        $pid = $this->id($id);
        if (!DB::val('SELECT id FROM products WHERE id = ?', [$pid])) {
            Response::fail('পণ্য পাওয়া যায়নি।', [], 404);
        }
        $files = Request::files('images');
        if (!$files) {
            Response::fail('কোনো ছবি নির্বাচন করা হয়নি।');
        }
        if ((int) DB::val('SELECT COUNT(*) FROM product_images WHERE product_id = ?', [$pid]) + count($files) > 20) {
            Response::fail('একটি পণ্যে সর্বোচ্চ ২০টি ছবি রাখা যাবে।');
        }
        $saved = [];
        $errors = [];
        $sort = (int) DB::val('SELECT COALESCE(MAX(sort_order), -1) FROM product_images WHERE product_id = ?', [$pid]);
        foreach ($files as $f) {
            try {
                $img = ImageProcessor::storePhoto($f, 'products');
                $imgId = DB::insert('product_images', ['product_id' => $pid, 'path' => $img['path'], 'width' => $img['width'], 'height' => $img['height'], 'sort_order' => ++$sort]);
                $saved[] = ['id' => $imgId, 'thumb' => img_url($img['path'], 'sm'), 'size' => self::sizeOf($img['path'])];
            } catch (UploadException $e) {
                $errors[] = $f['name'] . ': ' . $e->getMessage();
            } catch (Throwable $e) {
                Logger::error('Image process failed: ' . $e->getMessage());
                Notifier::add('upload_error', 'ইমেজ আপলোড ত্রুটি', $f['name'] . ' প্রসেস করা যায়নি।');
                $errors[] = $f['name'] . ': প্রসেস করা যায়নি।';
            }
        }
        if (!$saved) {
            Response::fail($errors[0] ?? 'আপলোড ব্যর্থ হয়েছে।');
        }
        Response::ok(['images' => $saved, 'errors' => $errors], bn_num(count($saved)) . 'টি ছবি আপলোড ও কমপ্রেস হয়েছে।' . ($errors ? ' কিছু ছবি বাদ পড়েছে।' : ''));
    }

    private static function sizeOf(string $base): string
    {
        $f = BASE_PATH . '/' . $base . '-md.webp';
        return is_file($f) ? round(filesize($f) / 1024) . 'KB' : '';
    }

    public function reorderImages(string $id): void
    {
        $pid = $this->id($id);
        foreach (array_values((array) Request::input('order', [])) as $i => $imgId) {
            DB::run('UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?', [$i, (int) $imgId, $pid]);
        }
        Response::ok(null, 'ছবির ক্রম সংরক্ষিত হয়েছে।');
    }

    public function deleteImage(string $id): void
    {
        $img = DB::one('SELECT * FROM product_images WHERE id = ?', [$this->id($id)]);
        if (!$img) {
            Response::fail('ছবি পাওয়া যায়নি।', [], 404);
        }
        DB::run('DELETE FROM product_images WHERE id = ?', [$img['id']]);
        ImageProcessor::delete($img['path']);
        Response::ok(null, 'ছবি মুছে ফেলা হয়েছে।');
    }

    public function replaceImage(string $id): void
    {
        $img = DB::one('SELECT * FROM product_images WHERE id = ?', [$this->id($id)]);
        if (!$img) {
            Response::fail('ছবি পাওয়া যায়নি।', [], 404);
        }
        $new = self::photo('image', 'products');
        if (!$new) {
            Response::fail('কোনো ছবি নির্বাচন করা হয়নি।');
        }
        DB::update('product_images', ['path' => $new['path'], 'width' => $new['width'], 'height' => $new['height']], 'id = ?', [$img['id']]);
        ImageProcessor::delete($img['path']);
        Response::ok(['thumb' => img_url($new['path'], 'sm'), 'size' => self::sizeOf($new['path'])], 'ছবি পরিবর্তন হয়েছে।');
    }

    public function toggle(string $id): void
    {
        $field = in_array(Request::str('field'), ['is_active', 'is_featured', 'free_delivery', 'is_flash'], true) ? Request::str('field') : 'is_active';
        DB::run("UPDATE products SET `{$field}` = 1 - `{$field}` WHERE id = ?", [$this->id($id)]);
        Response::ok(null, 'আপডেট হয়েছে।');
    }

    public function trash(string $id): void
    {
        TrashService::trash('product', $this->id($id)) ? Response::ok(null, 'পণ্য ট্র্যাশে পাঠানো হয়েছে।') : Response::fail('মুছে ফেলা যায়নি।');
    }

    public function search(): void
    {
        $q = mb_substr(Request::query('q'), 0, 60);
        $rows = DB::all('SELECT id, name, price, stock FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR sku = ?) ORDER BY name LIMIT 12', ['%' . addcslashes($q, '%_\\') . '%', $q]);
        Response::ok(['items' => $rows]);
    }

    public function editorUpload(): void
    {
        $path = self::upload('image', 'editor', 1000, 'webp');
        if (!$path) {
            Response::fail('কোনো ছবি নির্বাচন করা হয়নি।');
        }
        Response::ok(['url' => '/' . $path]);
    }

    public function stock(): void
    {
        $threshold = (int) setting('low_stock_threshold', 10);
        $filter = Request::query('filter', 'all');
        $q = mb_substr(Request::query('q'), 0, 60);
        $where = ['p.deleted_at IS NULL'];
        $params = [];
        if ($filter === 'low') $where[] = "p.stock > 0 AND p.stock <= COALESCE(p.low_stock_threshold, {$threshold})";
        if ($filter === 'out') $where[] = 'p.stock <= 0';
        if ($q !== '') {
            $where[] = 'p.name LIKE ?';
            $params[] = '%' . addcslashes($q, '%_\\') . '%';
        }
        $items = DB::all('SELECT p.id, p.name, p.sku, p.stock, p.sold, p.low_stock_threshold, (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) image
            FROM products p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.stock ASC, p.name LIMIT 200', $params);
        $summary = DB::one("SELECT COALESCE(SUM(stock),0) total_stock, COALESCE(SUM(sold),0) total_sold,
            SUM(stock <= 0) out_count, SUM(stock > 0 AND stock <= COALESCE(low_stock_threshold, {$threshold})) low_count FROM products WHERE deleted_at IS NULL");
        $combos = DB::all('SELECT id, name, stock FROM combos WHERE deleted_at IS NULL ORDER BY stock ASC');
        View::admin('stock', compact('items', 'summary', 'threshold', 'filter', 'q', 'combos'), 'স্টক', 'stock');
    }

    public function adjustStock(string $id): void
    {
        $pid = $this->id($id);
        $table = Request::str('type') === 'combo' ? 'combos' : 'products';
        $mode = Request::str('mode');
        $value = Request::int('value');
        if ($mode === 'set') {
            DB::run("UPDATE `{$table}` SET stock = ? WHERE id = ?", [max(0, $value), $pid]);
        } else {
            DB::run("UPDATE `{$table}` SET stock = GREATEST(0, stock + ?) WHERE id = ?", [$value, $pid]);
        }
        $stock = (int) DB::val("SELECT stock FROM `{$table}` WHERE id = ?", [$pid]);
        if ($table === 'products') {
            if (Request::str('threshold') !== '') {
                DB::run('UPDATE products SET low_stock_threshold = ? WHERE id = ?', [max(0, Request::int('threshold')), $pid]);
            }
            StockService::notifyLow([$pid]);
        }
        Response::ok(['stock' => $stock, 'stock_text' => bn_num($stock)], 'স্টক আপডেট হয়েছে: ' . bn_num($stock));
    }

    public function flash(): void
    {
        $items = DB::all('SELECT p.id, p.name, p.price, p.is_flash, p.flash_price, p.flash_start, p.flash_end, p.stock,
            (SELECT path FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) image
            FROM products p WHERE p.deleted_at IS NULL ORDER BY p.is_flash DESC, p.flash_end IS NULL, p.flash_end, p.name LIMIT 300');
        View::admin('flash', ['items' => $items], 'ফ্ল্যাশ সেল', 'flash');
    }

    public function saveFlash(string $id): void
    {
        $pid = $this->id($id);
        $p = DB::one('SELECT price FROM products WHERE id = ?', [$pid]);
        if (!$p) {
            Response::fail('পণ্য পাওয়া যায়নি।', [], 404);
        }
        $on = Request::bool('is_flash');
        $fp = self::money(Request::input('flash_price'), true);
        if ($on && ($fp === null || $fp <= 0 || $fp >= (float) $p['price'])) {
            Response::fail('ফ্ল্যাশ মূল্য বর্তমান মূল্যের (' . money($p['price']) . ') চেয়ে কম হতে হবে।');
        }
        $start = self::dt(Request::str('flash_start'));
        $end = self::dt(Request::str('flash_end'));
        if ($start && $end && strtotime($end) <= strtotime($start)) {
            Response::fail('শেষ সময় শুরুর সময়ের পরে হতে হবে।');
        }
        DB::update('products', ['is_flash' => (int) $on, 'flash_price' => $fp, 'flash_start' => $start, 'flash_end' => $end], 'id = ?', [$pid]);
        Response::ok(null, 'ফ্ল্যাশ সেল আপডেট হয়েছে।');
    }
}
