<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api;

use OryzenX\Controllers\Controller;
use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Core\Validator;
use OryzenX\Services\AuditService;
use OryzenX\Services\AuthService;
use OryzenX\Services\NotificationService;
use OryzenX\Services\PushService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\SupportService;
use OryzenX\Services\UploadService;
use OryzenX\Services\VerificationService;

/** The signed-in user's own profile, security, preferences, notifications and verification. */
final class AccountController extends Controller
{
    public function __construct(
        private Database $db,
        private AuthService $auth,
        private UploadService $uploads,
        private NotificationService $notify,
        private PushService $push,
        private VerificationService $verification,
        private SupportService $support,
        private SettingsService $settings,
        private AuditService $audit
    ) {
    }

    public function profile(Request $req): Response
    {
        $u = $this->user($req);
        $p = $this->db->one('SELECT address_line, city, country, postal_code, date_of_birth FROM user_profiles WHERE user_id = :u', ['u' => $u['id']]) ?? [];
        return Response::ok(['user' => $this->auth->present($u), 'profile' => $p]);
    }

    public function updateProfile(Request $req): Response
    {
        $u = $this->user($req);
        $data = Validator::make($req->json(), [
            'full_name' => 'required|string|min:2|max:120',
            'phone' => 'nullable|phone',
            'address_line' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'country' => 'nullable|string|max:100',
            'postal_code' => 'nullable|string|max:20',
        ])->validated();
        $this->db->update('users', ['full_name' => strip_tags($data['full_name']), 'phone' => $data['phone'], 'updated_at' => Database::now()], 'id = :id', ['id' => $u['id']]);
        $this->db->run(
            'INSERT INTO user_profiles (user_id, address_line, city, country, postal_code, updated_at) VALUES (:u, :a, :c, :co, :p, :n)
             ON DUPLICATE KEY UPDATE address_line = VALUES(address_line), city = VALUES(city), country = VALUES(country), postal_code = VALUES(postal_code), updated_at = VALUES(updated_at)',
            ['u' => $u['id'], 'a' => $data['address_line'] ? strip_tags($data['address_line']) : null, 'c' => $data['city'] ? strip_tags($data['city']) : null,
             'co' => $data['country'] ? strip_tags($data['country']) : null, 'p' => $data['postal_code'] ? strip_tags($data['postal_code']) : null, 'n' => Database::now()]
        );
        return $this->profile($this->withUser($req));
    }

    private function withUser(Request $req): Request
    {
        $req->attrs['user'] = $this->auth->findUser($this->uid($req));
        return $req;
    }

    public function preferences(Request $req): Response
    {
        $data = Validator::make($req->json(), [
            'locale' => 'nullable|in:en,bn',
            'theme' => 'nullable|in:light,dark,system',
        ])->validated();
        $upd = array_filter(['locale' => $data['locale'] ?? null, 'theme' => $data['theme'] ?? null]);
        if ($upd) {
            $this->db->update('users', $upd + ['updated_at' => Database::now()], 'id = :id', ['id' => $this->uid($req)]);
        }
        $res = Response::ok(['user' => $this->auth->present($this->auth->findUser($this->uid($req)))]);
        if (isset($upd['locale'])) {
            $res->cookie('oryx_lang', $upd['locale'], ['expires' => time() + 31536000, 'path' => '/', 'secure' => $req->isHttps(), 'samesite' => 'Lax']);
        }
        return $res;
    }

    public function uploadAvatar(Request $req): Response
    {
        $u = $this->user($req);
        $stored = $this->uploads->store($req->files['avatar'] ?? [], 'avatar', 'avatars');
        $old = $this->db->value('SELECT avatar_path FROM users WHERE id = :id', ['id' => $u['id']]);
        $this->db->update('users', ['avatar_path' => $stored['path'], 'updated_at' => Database::now()], 'id = :id', ['id' => $u['id']]);
        $this->uploads->delete($old);
        return Response::ok(['avatar_url' => \OryzenX\Core\View::url('api/me/avatar'), 'bytes' => $stored['bytes'], 'original_bytes' => $stored['original_bytes']]);
    }

    public function avatar(Request $req): Response
    {
        $ref = $this->db->value('SELECT avatar_path FROM users WHERE id = :id', ['id' => $this->uid($req)]);
        $abs = $ref ? $this->uploads->privatePath($ref) : null;
        if (!$abs) {
            throw HttpException::notFound();
        }
        return $this->file($abs, 'image/jpeg');
    }

    public function changePassword(Request $req): Response
    {
        $this->auth->changePassword($this->user($req), $req->attrs['session'], (string) $req->input('current_password', ''), (string) $req->input('password', ''), (string) $req->input('password_confirmation', ''));
        return Response::ok(['message' => 'Password updated. Other devices have been signed out.']);
    }

    public function sessions(Request $req): Response
    {
        $current = (int) $req->attrs['session']['id'];
        $rows = array_map(fn ($s) => $s + ['current' => (int) $s['id'] === $current], $this->auth->sessions($this->uid($req)));
        return Response::ok(['sessions' => $rows, 'logins' => $this->auth->loginHistory($this->uid($req), 20)]);
    }

    public function revokeSession(Request $req): Response
    {
        $ok = $this->auth->revokeSession($this->uid($req), $this->id($req));
        if (!$ok) {
            throw HttpException::notFound('Session not found.');
        }
        return Response::ok(['revoked' => true]);
    }

    public function revokeOthers(Request $req): Response
    {
        $n = $this->auth->revokeOtherSessions($this->uid($req), (int) $req->attrs['session']['id']);
        $this->audit->log($this->uid($req), 'auth.sessions_revoked', 'user', $this->uid($req), ['count' => $n]);
        return Response::ok(['revoked' => $n]);
    }

    public function notificationPrefs(Request $req): Response
    {
        return Response::ok($this->notify->preferences($this->uid($req)));
    }

    public function updateNotificationPrefs(Request $req): Response
    {
        return Response::ok($this->notify->updatePreferences($this->uid($req), $req->json()));
    }

    public function notifications(Request $req): Response
    {
        [$page, $per] = $this->paging($req);
        [$rows, $total, $unread] = $this->notify->list($this->uid($req), $page, $per);
        return Response::ok($rows, ['page' => $page, 'per_page' => $per, 'total' => $total, 'unread' => $unread, 'pages' => (int) ceil($total / $per)]);
    }

    public function markRead(Request $req): Response
    {
        $id = $req->input('id');
        $this->notify->markRead($this->uid($req), $id !== null && $id !== '' ? (int) $id : null);
        return Response::ok(['read' => true]);
    }

    public function registerPush(Request $req): Response
    {
        $this->push->registerToken($this->uid($req), $req->str('token'), $req->str('platform', 'android'), $req->str('device_name') ?: null);
        return Response::ok(['registered' => true, 'delivery_active' => $this->push->configured()]);
    }

    public function unregisterPush(Request $req): Response
    {
        $this->push->unregisterToken($this->uid($req), $req->str('token'));
        return Response::ok(['unregistered' => true]);
    }

    public function verificationStatus(Request $req): Response
    {
        return Response::ok($this->verification->status($this->uid($req)) + [
            'identity_required' => $this->settings->bool('require_identity_verification', true),
        ]);
    }

    public function submitVerification(Request $req): Response
    {
        $res = $this->verification->submit($this->uid($req), $req->str('document_type'), $req->str('document_number'), [
            'front' => $req->files['front'] ?? null,
            'back' => $req->files['back'] ?? null,
        ]);
        return Response::ok($res);
    }

    public function support(Request $req): Response
    {
        $u = $this->user($req);
        $input = $req->json() + ['name' => $u['full_name'], 'email' => $u['email']];
        $input['name'] = $u['full_name'];
        $input['email'] = $u['email'];
        $id = $this->support->submit($input, $req->ip(), (int) $u['id'], $u['locale'], 'app');
        return Response::ok(['ticket' => $id, 'message' => 'Thanks — your message has been received. Ticket #' . $id . '.']);
    }
}
