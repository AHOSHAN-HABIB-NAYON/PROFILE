<?php
final class AdminAuthController
{
    public function loginForm(): void
    {
        if (Auth::check()) {
            Response::redirect('/admin');
        }
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow');
        echo View::render('admin/views/login', ['error' => Session::flash('login_error')]);
    }

    public function login(): void
    {
        $result = Auth::attempt(Request::str('username'), (string) Request::input('password', ''));
        if ($result === true) {
            Response::json(true, 'স্বাগতম!', null, [], '/admin');
        }
        Response::fail(is_string($result) ? $result : 'ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।', [], is_string($result) ? 429 : 422);
    }

    public function logout(): void
    {
        Auth::logout();
        Response::redirect('/admin/login');
    }
}
