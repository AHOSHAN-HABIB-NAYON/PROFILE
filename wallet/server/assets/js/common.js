/* Shared helpers: API calls, formatting, toasts and passkey encoding. */
(function ($, window) {
    'use strict';

    var BN_DIGITS = '০১২৩৪৫৬৭৮৯';

    var Joma = {};

    /**
     * Calls the JSON API. Resolves with the response body; rejects with
     * { status, code, message } using the server's Bengali message.
     */
    Joma.api = function (method, path, data) {
        return $.ajax({
            url: 'api/' + path,
            method: method,
            contentType: data !== undefined ? 'application/json' : undefined,
            data: data !== undefined ? JSON.stringify(data) : undefined,
            dataType: 'json',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            timeout: 20000
        }).then(null, function (xhr) {
            var error = (xhr.responseJSON && xhr.responseJSON.error) || {};
            if (xhr.status === 401 && error.code === 'unauthenticated') {
                window.location.href = 'index.php';
            }
            var message = error.message ||
                (xhr.status === 0 ? 'ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না।' : 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।');
            return $.Deferred().reject({ status: xhr.status, code: error.code || 'error', message: message });
        });
    };

    Joma.bnDigits = function (text) {
        return String(text).replace(/[0-9]/g, function (d) { return BN_DIGITS[d]; });
    };

    /** "125050.5" → "১,২৫,০৫০.৫০" (Bangladeshi lakh grouping). */
    Joma.taka = function (amount) {
        var parts = Number(amount).toFixed(2).split('.');
        var whole = parts[0];
        var negative = whole.charAt(0) === '-';
        if (negative) { whole = whole.slice(1); }
        var last3 = whole.slice(-3);
        var rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
        var grouped = rest ? rest + ',' + last3 : last3;
        return (negative ? '-' : '') + Joma.bnDigits(grouped + '.' + parts[1]);
    };

    /** Server times are Asia/Dhaka ("2026-10-08 14:30:00"). */
    Joma.date = function (text) {
        var date = new Date(text.replace(' ', 'T') + '+06:00');
        try {
            return new Intl.DateTimeFormat('bn-BD', {
                day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka'
            }).format(date);
        } catch (e) {
            return Joma.bnDigits(text.slice(0, 16));
        }
    };

    /** A fresh random key per money request, so a retried request is applied only once. */
    Joma.idempotencyKey = function () {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    };

    var toastTimer;
    Joma.toast = function (message, isError) {
        var $toast = $('#toast');
        clearTimeout(toastTimer);
        $toast.text(message).toggleClass('is-error', !!isError).prop('hidden', false);
        toastTimer = setTimeout(function () { $toast.prop('hidden', true); }, isError ? 5000 : 3000);
    };

    Joma.busy = function ($button, busy) {
        $button.toggleClass('is-loading', busy).prop('disabled', busy).attr('aria-busy', busy ? 'true' : null);
    };

    Joma.showFormError = function ($form, message) {
        $form.find('.form-error').text(message || '').prop('hidden', !message);
    };

    // ------------------------------------------------------------- passkeys

    Joma.passkeysSupported = function () {
        return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
    };

    function toBuffer(base64url) {
        var base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        var binary = window.atob(base64 + '==='.slice((base64.length + 3) % 4));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
        return bytes.buffer;
    }

    function toBase64url(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
        return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /** Registration options from the server (JSON) → navigator.credentials.create() options. */
    Joma.creationOptions = function (options) {
        var publicKey = $.extend(true, {}, options);
        publicKey.challenge = toBuffer(options.challenge);
        publicKey.user.id = toBuffer(options.user.id);
        publicKey.excludeCredentials = (options.excludeCredentials || []).map(function (c) {
            return { type: c.type, id: toBuffer(c.id) };
        });
        return { publicKey: publicKey };
    };

    Joma.requestOptions = function (options) {
        var publicKey = $.extend(true, {}, options);
        publicKey.challenge = toBuffer(options.challenge);
        publicKey.allowCredentials = (options.allowCredentials || []).map(function (c) {
            return { type: c.type, id: toBuffer(c.id) };
        });
        return { publicKey: publicKey };
    };

    /** A PublicKeyCredential → the JSON shape the server (and Android) use. */
    Joma.credentialJSON = function (credential) {
        var r = credential.response;
        var response = { clientDataJSON: toBase64url(r.clientDataJSON) };
        if (r.attestationObject) {
            response.attestationObject = toBase64url(r.attestationObject);
            if (r.getTransports) { response.transports = r.getTransports(); }
        } else {
            response.authenticatorData = toBase64url(r.authenticatorData);
            response.signature = toBase64url(r.signature);
            if (r.userHandle) { response.userHandle = toBase64url(r.userHandle); }
        }
        return { id: credential.id, rawId: toBase64url(credential.rawId), type: credential.type, response: response };
    };

    /** Friendly message for errors thrown by navigator.credentials. */
    Joma.passkeyError = function (error) {
        if (!error) { return null; }
        if (error.message && error.status !== undefined) { return error.message; } // our API error
        switch (error.name) {
            case 'NotAllowedError':
            case 'AbortError':
                return null; // the person cancelled
            case 'InvalidStateError':
                return 'এই ডিভাইসের পাসকি আগেই যোগ করা আছে।';
            case 'SecurityError':
                return 'এই ঠিকানায় পাসকি ব্যবহার করা যাচ্ছে না (HTTPS প্রয়োজন)।';
            default:
                return 'পাসকি ব্যবহার করা যায়নি। আবার চেষ্টা করুন।';
        }
    };

    window.Joma = Joma;
})(jQuery, window);
