<?php
/**
 * Coupons: percentage/fixed, min order, max discount, expiry, usage & per-customer limits.
 */
final class AdminCouponController extends AdminController
{
    public function index(Request $r): Response
    {
        $edit = $r->get('edit') ? DB::one('SELECT * FROM coupons WHERE id = ? AND deleted_at IS NULL', [(int)$r->get('edit')]) : null;
        $rows = DB::all('SELECT * FROM coupons WHERE deleted_at IS NULL ORDER BY id DESC');
        return $this->page('coupons', ['rows' => $rows, 'edit' => $edit, 'enabled' => setting('coupon_enabled') === '1'],
            ['title' => 'Coupons', 'nav' => 'coupons', 'page' => 'coupons']);
    }

    public function save(Request $r): Response
    {
        if ($r->input('toggle_system') !== null) {
            Setting::set('coupon_enabled', $r->bool('coupon_enabled') ? '1' : '0');
            Cache::catalogChanged();
            return $this->done('Coupon system ' . ($r->bool('coupon_enabled') ? 'enabled.' : 'disabled.'));
        }
        $id = $r->int('id');
        $existing = $id ? DB::one('SELECT * FROM coupons WHERE id = ? AND deleted_at IS NULL', [$id]) : null;
        if ($id && !$existing) {
            return $this->fail('Coupon not found.', 404);
        }
        $code = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '', $r->str('code', 40)));
        $type = $r->str('type', 10) === 'fixed' ? 'fixed' : 'percent';
        $value = $this->money($r, 'value');
        $this->validate(['code' => $code, 'value' => $value], ['code' => 'required|min:3|max:40', 'value' => 'required|numeric'], ['code' => 'Code', 'value' => 'Value']);
        if ($value <= 0 || ($type === 'percent' && $value > 100)) {
            return $this->fail('Discount value must be above 0' . ($type === 'percent' ? ' and at most 100%.' : '.'));
        }
        if (DB::value('SELECT id FROM coupons WHERE code = ? AND id <> ?', [$code, $id])) {
            return $this->fail('This code already exists (check Trash too).');
        }
        $limit = $r->str('usage_limit', 10);
        $perUser = $r->str('per_user_limit', 10);
        $data = [
            'code' => $code, 'description' => $this->strOrNull($r, 'description', 255), 'type' => $type, 'value' => $value,
            'min_order' => $this->money($r, 'min_order'), 'max_discount' => $this->money($r, 'max_discount', null) ?: null,
            'starts_at' => $this->dateOrNull($r, 'starts_at'), 'expires_at' => $this->dateOrNull($r, 'expires_at'),
            'usage_limit' => ctype_digit($limit) && (int)$limit > 0 ? (int)$limit : null,
            'per_user_limit' => ctype_digit($perUser) && (int)$perUser > 0 ? (int)$perUser : null,
            'is_active' => $r->bool('is_active') ? 1 : 0, 'show_on_home' => $r->bool('show_on_home') ? 1 : 0,
        ];
        if ($existing) {
            DB::update('coupons', $data, 'id = ?', [$id]);
        } else {
            $id = DB::insert('coupons', $data);
        }
        [$old, $new] = Audit::diff($existing ?? [], $data);
        Audit::log($existing ? 'coupon.update' : 'coupon.create', 'coupon', $id, $old ?: null, $new ?: null);
        Cache::catalogChanged();
        return $this->done('Coupon saved.', ['redirect' => url('/admin/coupons')]);
    }

    public function delete(Request $r, string $id): Response
    {
        return Trash::softDelete('coupon', (int)$id) ? $this->done('Coupon moved to trash.') : $this->fail('Coupon not found.', 404);
    }
}
