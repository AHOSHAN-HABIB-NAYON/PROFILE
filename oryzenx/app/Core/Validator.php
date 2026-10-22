<?php
declare(strict_types=1);

namespace OryzenX\Core;

/**
 * Server-side validation. Usage:
 *   $v = Validator::make($input, ['email' => 'required|email|max:190', 'qty' => 'required|decimal|gt:0']);
 *   $data = $v->validated(); // throws HttpException 422 with per-field messages
 */
final class Validator
{
    private array $errors = [];
    private array $clean = [];

    private function __construct(private array $input, private array $rules)
    {
    }

    public static function make(array $input, array $rules): self
    {
        $v = new self($input, $rules);
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

    public function validated(): array
    {
        if ($this->fails()) {
            throw HttpException::validation($this->errors);
        }
        return $this->clean;
    }

    private function run(): void
    {
        foreach ($this->rules as $field => $ruleStr) {
            $rules = is_array($ruleStr) ? $ruleStr : explode('|', $ruleStr);
            $raw = $this->input[$field] ?? null;
            $value = is_string($raw) ? trim($raw) : $raw;
            $present = !($value === null || $value === '' || $value === []);
            $nullable = in_array('nullable', $rules, true);

            if (!$present) {
                if (in_array('required', $rules, true)) {
                    $this->errors[$field] = 'This field is required.';
                } elseif (in_array('accepted', $rules, true)) {
                    $this->errors[$field] = 'You must accept to continue.';
                } else {
                    $this->clean[$field] = $nullable ? null : ($value ?? null);
                    foreach ($rules as $r) {
                        if (str_starts_with($r, 'default:')) {
                            $this->clean[$field] = substr($r, 8);
                        }
                    }
                    if (in_array('bool', $rules, true)) {
                        $this->clean[$field] = false;
                    }
                }
                continue;
            }

            foreach ($rules as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $err = $this->check($name, $arg, $value, $field);
                if ($err !== null) {
                    $this->errors[$field] = $err;
                    break;
                }
                if ($name === 'decimal') {
                    $value = Decimal::normalize((string) $value);
                } elseif ($name === 'int') {
                    $value = (int) $value;
                } elseif ($name === 'bool') {
                    $value = in_array($value, [true, 1, '1', 'true', 'on', 'yes'], true);
                } elseif ($name === 'email') {
                    $value = mb_strtolower((string) $value);
                }
            }
            if (!isset($this->errors[$field])) {
                $this->clean[$field] = $value;
            }
        }
    }

    private function check(string $name, ?string $arg, mixed $value, string $field): ?string
    {
        $s = is_scalar($value) ? (string) $value : '';
        switch ($name) {
            case 'required':
            case 'nullable':
            case 'bool':
                return null;
            case 'accepted':
                return in_array($value, [true, 1, '1', 'true', 'on', 'yes'], true) ? null : 'You must accept to continue.';
            case 'string':
                return is_string($value) ? null : 'Must be text.';
            case 'email':
                return filter_var($s, FILTER_VALIDATE_EMAIL) && mb_strlen($s) <= 190 ? null : 'Enter a valid email address.';
            case 'min':
                return mb_strlen($s) >= (int) $arg ? null : "Must be at least {$arg} characters.";
            case 'max':
                return mb_strlen($s) <= (int) $arg ? null : "Must be at most {$arg} characters.";
            case 'int':
                return filter_var($value, FILTER_VALIDATE_INT) !== false ? null : 'Must be a whole number.';
            case 'decimal':
                if (!is_string($value) && !is_int($value)) {
                    // floats are rejected to avoid binary rounding of money values
                    return is_float($value) ? 'Send numbers as strings (e.g. "106.50").' : 'Enter a valid number.';
                }
                if (!Decimal::isValid($s)) {
                    return 'Enter a valid number.';
                }
                [$int, $frac] = array_pad(explode('.', ltrim($s, '+-'), 2), 2, '');
                if (strlen(ltrim($int, '0')) > 18 || strlen($frac) > 18) {
                    return 'Number has too many digits.';
                }
                return null;
            case 'gt':
                return Decimal::cmp($s, (string) $arg) > 0 ? null : "Must be greater than {$arg}.";
            case 'gte':
                return Decimal::cmp($s, (string) $arg) >= 0 ? null : "Must be {$arg} or more.";
            case 'lte':
                return Decimal::cmp($s, (string) $arg) <= 0 ? null : "Must be {$arg} or less.";
            case 'in':
                return in_array($s, explode(',', (string) $arg), true) ? null : 'Select a valid option.';
            case 'regex':
                return preg_match((string) $arg, $s) ? null : 'Invalid format.';
            case 'date':
                $d = \DateTimeImmutable::createFromFormat('Y-m-d', $s);
                return $d && $d->format('Y-m-d') === $s ? null : 'Enter a valid date (YYYY-MM-DD).';
            case 'datetime':
                try {
                    new \DateTimeImmutable($s);
                    return preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?(Z|[+-]\d{2}:?\d{2})?$/', $s) ? null : 'Enter a valid date and time.';
                } catch (\Exception) {
                    return 'Enter a valid date and time.';
                }
            case 'phone':
                return preg_match('/^\+?[0-9 ()-]{6,20}$/', $s) ? null : 'Enter a valid phone number.';
            case 'same':
                return $value === ($this->input[(string) $arg] ?? null) ? null : 'Values do not match.';
            case 'password':
                if (mb_strlen($s) < 10) {
                    return 'Password must be at least 10 characters.';
                }
                if (!preg_match('/[A-Za-z]/', $s) || !preg_match('/\d/', $s)) {
                    return 'Password must contain letters and numbers.';
                }
                return mb_strlen($s) <= 200 ? null : 'Password is too long.';
            case 'url':
                return filter_var($s, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $s) ? null : 'Enter a valid URL.';
            case 'symbol':
                return preg_match('/^[A-Z0-9]{2,15}$/', $s) ? null : 'Use 2–15 uppercase letters or digits.';
            case 'slug':
                return preg_match('/^[a-z0-9][a-z0-9_.-]{0,99}$/', $s) ? null : 'Use lowercase letters, digits, dashes, dots or underscores.';
            case 'array':
                return is_array($value) ? null : 'Invalid list.';
            case 'default':
                return null;
            default:
                throw new \LogicException("Unknown validation rule {$name}");
        }
    }
}
