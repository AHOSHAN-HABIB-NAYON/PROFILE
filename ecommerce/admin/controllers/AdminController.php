<?php
/**
 * Base class for admin controllers: page rendering in the admin shell and
 * small helpers for the JSON responses consumed by admin.js.
 */
abstract class AdminController
{
    /**
     * @param array $meta title, nav, scripts[], styles[]
     */
    protected function page(string $view, array $data = [], array $meta = []): Response
    {
        $meta += ['nav' => '', 'scripts' => [], 'styles' => [], 'cacheable' => false];
        return View::page('admin:pages/' . $view, $data, $meta, 'admin');
    }

    /** Success → admin.js shows a toast, then reloads the current view or follows `redirect`. */
    protected function done(string $message, array $extra = ['reload' => true]): Response
    {
        return Response::success($message, $extra);
    }

    protected function fail(string $message, int $status = 422, array $errors = []): Response
    {
        return Response::error($message, $status, $errors);
    }

    protected function validate(array $data, array $rules, array $labels = []): void
    {
        $v = Validator::make($data, $rules, $labels);
        if ($v->fails()) {
            throw new ValidationException($v->errors());
        }
    }

    /** Nullable trimmed string from input. */
    protected function strOrNull(Request $r, string $key, int $max = 255): ?string
    {
        $v = $r->str($key, $max);
        return $v === '' ? null : $v;
    }

    protected function dateOrNull(Request $r, string $key): ?string
    {
        $v = $r->str($key, 30);
        return $v !== '' && strtotime($v) ? date('Y-m-d H:i:s', strtotime($v)) : null;
    }

    protected function money(Request $r, string $key, ?float $default = 0.0): ?float
    {
        $v = en_digits((string)$r->input($key, ''));
        return is_numeric($v) ? round(max(0, (float)$v), 2) : $default;
    }
}
