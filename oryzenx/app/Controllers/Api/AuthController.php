<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api;

use OryzenX\Controllers\Controller;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Services\AuthService;
use OryzenX\Services\SettingsService;

/**
 * Authentication API used by the web apps (cookie session + CSRF) and the Android app (bearer token).
 * The client chooses with "client": "web" (default) or "android".
 */
final class AuthController extends Controller
{
    public function __construct(private AuthService $auth, private SettingsService $settings)
    {
    }

    private function kind(Request $req): string
    {
        return in_array($req->str('client'), ['android', 'api'], true) ? 'api' : 'web';
    }

    private function sessionResponse(Request $req, array $login, int $status = 200): Response
    {
        $kind = $this->kind($req);
        $payload = ['user' => $this->auth->present($login['user'])];
        if ($kind === 'api') {
            $payload['token'] = $login['token'];
            $payload['expires_at'] = $login['session']['expires_at'];
        } else {
            $payload['csrf_token'] = $login['session']['csrf_token'];
        }
        $res = Response::json(['ok' => true, 'data' => $payload], $status);
        if ($kind === 'web') {
            $res->cookie(AuthService::WEB_COOKIE, $login['token'], [
                'expires' => 0, // browser-session cookie; server-side expiry enforces idle timeout
                'path' => '/',
                'secure' => $req->isHttps(),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        return $res;
    }

    public function register(Request $req): Response
    {
        $user = $this->auth->register($req->json(), $req->ip());
        // sign the new user in so they can complete email verification inside the app
        [$token, $session] = $this->auth->createSession((int) $user['id'], $req, $this->kind($req), $req->str('device_name') ?: null);
        return $this->sessionResponse($req, ['user' => $user, 'token' => $token, 'session' => $session], 201);
    }

    public function login(Request $req): Response
    {
        $email = $req->str('email');
        $password = (string) $req->input('password', '');
        if ($email === '' || $password === '') {
            throw HttpException::validation(array_filter([
                'email' => $email === '' ? 'Enter your email address.' : null,
                'password' => $password === '' ? 'Enter your password.' : null,
            ]));
        }
        $login = $this->auth->login($email, $password, $req, $this->kind($req), $req->str('device_name') ?: null);
        return $this->sessionResponse($req, $login);
    }

    public function google(Request $req): Response
    {
        $token = $req->str('id_token');
        if ($token === '') {
            throw HttpException::validation(['id_token' => 'Missing Google credential.']);
        }
        $login = $this->auth->googleLogin($token, $req, $this->kind($req), $req->str('device_name') ?: null);
        return $this->sessionResponse($req, $login);
    }

    public function logout(Request $req): Response
    {
        if (isset($req->attrs['session'])) {
            $this->auth->logout($req->attrs['session']);
        }
        $res = Response::ok(['logged_out' => true]);
        $res->cookie(AuthService::WEB_COOKIE, '', ['expires' => 1, 'path' => '/', 'secure' => $req->isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
        return $res;
    }

    public function me(Request $req): Response
    {
        $data = ['user' => $this->auth->present($this->user($req))];
        if ($req->attrs['session']['kind'] === 'web') {
            $data['csrf_token'] = $req->attrs['session']['csrf_token'];
        }
        return Response::ok($data);
    }

    public function forgot(Request $req): Response
    {
        $this->auth->requestPasswordReset($req->str('email'), $req->ip());
        // identical response whether or not the account exists
        return Response::ok(['message' => 'If an account exists for this email, a reset link has been sent. It expires in 60 minutes.']);
    }

    public function reset(Request $req): Response
    {
        $this->auth->resetPassword($req->str('token'), (string) $req->input('password', ''), (string) $req->input('password_confirmation', ''));
        return Response::ok(['message' => 'Your password has been changed. Sign in with your new password.']);
    }

    public function verifyCode(Request $req): Response
    {
        $user = $this->auth->verifyEmailByCode($this->uid($req), $req->str('code'));
        return Response::ok(['user' => $this->auth->present($user)]);
    }

    public function resendVerification(Request $req): Response
    {
        $u = $this->user($req);
        if ($u['email_verified_at'] !== null) {
            return Response::ok(['message' => 'Your email is already verified.']);
        }
        $this->auth->sendVerification($u, true);
        return Response::ok(['message' => 'A new verification email has been sent.']);
    }

    public function reauth(Request $req): Response
    {
        $this->auth->reauthenticate($this->user($req), $req->attrs['session'], (string) $req->input('password', ''), $req);
        return Response::ok(['reauthenticated' => true]);
    }
}
