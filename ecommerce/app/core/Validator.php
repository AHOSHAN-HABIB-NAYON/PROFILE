<?php
/**
 * Declarative server-side validation with Bengali messages.
 * Rules: required, max:N, min:N, numeric, int, phone, email, url, in:a,b,c, date, slug
 */
final class Validator
{
    private array $errors = [];

    public function __construct(private array $data, private array $rules, private array $labels = [])
    {
    }

    public static function make(array $data, array $rules, array $labels = []): self
    {
        $v = new self($data, $rules, $labels);
        $v->run();
        return $v;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    public function errors(): array
    {
        return $this->errors;
    }

    public function first(): string
    {
        return (string)(array_values($this->errors)[0] ?? '');
    }

    private function run(): void
    {
        foreach ($this->rules as $field => $ruleString) {
            $value = $this->data[$field] ?? null;
            $label = $this->labels[$field] ?? $field;
            $rules = is_array($ruleString) ? $ruleString : explode('|', $ruleString);
            $empty = $value === null || $value === '' || $value === [];
            foreach ($rules as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                if ($name === 'required') {
                    if ($empty) {
                        $this->errors[$field] = "$label আবশ্যক।";
                        break;
                    }
                    continue;
                }
                if ($empty) {
                    continue;
                }
                $error = match ($name) {
                    'max'     => mb_strlen((string)$value) > (int)$arg ? "$label সর্বোচ্চ $arg অক্ষর হতে পারে।" : null,
                    'min'     => mb_strlen((string)$value) < (int)$arg ? "$label কমপক্ষে $arg অক্ষর হতে হবে।" : null,
                    'numeric' => !is_numeric($value) ? "$label সংখ্যা হতে হবে।" : null,
                    'int'     => filter_var($value, FILTER_VALIDATE_INT) === false ? "$label পূর্ণসংখ্যা হতে হবে।" : null,
                    'gte'     => (is_numeric($value) && (float)$value < (float)$arg) ? "$label $arg বা তার বেশি হতে হবে।" : null,
                    'phone'   => normalize_phone((string)$value) === null ? 'সঠিক মোবাইল নাম্বার দিন (যেমন 01XXXXXXXXX)।' : null,
                    'email'   => !filter_var($value, FILTER_VALIDATE_EMAIL) ? 'সঠিক ইমেইল দিন।' : null,
                    'url'     => !preg_match('#^(https?://|/)#i', (string)$value) ? "$label সঠিক লিংক নয়।" : null,
                    'in'      => !in_array((string)$value, explode(',', (string)$arg), true) ? "$label সঠিক নয়।" : null,
                    'date'    => strtotime((string)$value) === false ? "$label সঠিক তারিখ নয়।" : null,
                    'slug'    => !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', (string)$value) ? 'Slug শুধু a-z, 0-9 ও হাইফেন হতে পারে।' : null,
                    'hex'     => !preg_match('/^#[0-9a-f]{6}$/i', (string)$value) ? "$label সঠিক রং কোড নয়।" : null,
                    default   => null,
                };
                if ($error !== null) {
                    $this->errors[$field] = $error;
                    break;
                }
            }
        }
    }
}
