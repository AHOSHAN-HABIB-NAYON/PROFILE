/* Login page: email/password, registration, Google and passkey sign-in. */
(function ($, window, Joma) {
    'use strict';

    function signedIn() {
        window.location.href = 'dashboard.php';
    }

    // Tabs ------------------------------------------------------------------

    function showTab(name) {
        var login = name === 'login';
        $('#tab-login').toggleClass('is-active', login).attr('aria-selected', String(login));
        $('#tab-register').toggleClass('is-active', !login).attr('aria-selected', String(!login));
        $('#login-form').prop('hidden', !login);
        $('#register-form').prop('hidden', login);
        $(login ? '#login-form' : '#register-form').find('input').first().trigger('focus');
    }

    $('#tab-login').on('click', function () { showTab('login'); });
    $('#tab-register').on('click', function () { showTab('register'); });

    // Email and password ----------------------------------------------------

    function submitForm($form, path, fields) {
        var data = {};
        var missing = null;
        fields.forEach(function (name) {
            var $input = $form.find('[name="' + name + '"]');
            data[name] = $.trim($input.val());
            var empty = data[name] === '';
            $input.attr('aria-invalid', empty ? 'true' : null);
            if (empty && !missing) { missing = $input; }
        });
        if (missing) {
            Joma.showFormError($form, 'সব ঘর পূরণ করুন।');
            missing.trigger('focus');
            return;
        }
        var $button = $form.find('[type=submit]');
        Joma.showFormError($form, null);
        Joma.busy($button, true);
        Joma.api('POST', path, data).then(signedIn, function (error) {
            Joma.busy($button, false);
            Joma.showFormError($form, error.message);
        });
    }

    $('#login-form').on('submit', function (event) {
        event.preventDefault();
        submitForm($(this), 'auth/login', ['email', 'password']);
    });

    $('#register-form').on('submit', function (event) {
        event.preventDefault();
        submitForm($(this), 'auth/register', ['name', 'email', 'password']);
    });

    $('.form input').on('input', function () {
        $(this).attr('aria-invalid', null);
    });

    // Passkey -----------------------------------------------------------------

    var $passkey = $('#passkey-login');
    if (!Joma.passkeysSupported()) {
        $passkey.prop('disabled', true).append(' (এই ব্রাউজারে নেই)');
    }

    $passkey.on('click', function () {
        Joma.busy($passkey, true);
        var challengeId;
        Joma.api('POST', 'auth/passkey/options', {})
            .then(function (res) {
                challengeId = res.challenge_id;
                return navigator.credentials.get(Joma.requestOptions(res.options));
            })
            .then(function (credential) {
                return Joma.api('POST', 'auth/passkey/verify', {
                    challenge_id: challengeId,
                    credential: Joma.credentialJSON(credential)
                });
            })
            .then(signedIn, function (error) {
                Joma.busy($passkey, false);
                var message = Joma.passkeyError(error);
                if (message) { Joma.toast(message, true); }
            });
    });

    // Google ----------------------------------------------------------------

    var clientId = $('body').data('google-client-id');

    function onGoogleCredential(response) {
        Joma.api('POST', 'auth/google', { id_token: response.credential }).then(signedIn, function (error) {
            Joma.toast(error.message, true);
        });
    }

    function setUpGoogle() {
        var slot = document.getElementById('google-button');
        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: onGoogleCredential,
            ux_mode: 'popup',
            context: 'signin'
        });
        window.google.accounts.id.renderButton(slot, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            locale: 'bn',
            width: Math.min(slot.clientWidth || 400, 400)
        });
    }

    if (clientId) {
        // The Google script loads asynchronously; wait for it.
        var tries = 0;
        (function waitForGoogle() {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                setUpGoogle();
            } else if (tries++ < 50) {
                setTimeout(waitForGoogle, 200);
            } else {
                $('#google-button').html('<p class="muted">Google লগইন লোড হয়নি। পেজটি আবার খুলুন।</p>');
            }
        })();
    }
})(jQuery, window, window.Joma);
