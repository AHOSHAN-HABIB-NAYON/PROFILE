/* Dashboard: balance, money actions, history and passkeys. */
(function ($, window, Joma) {
    'use strict';

    var ICONS = {
        in: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
        out: '<svg viewBox="0 0 24 24"><path d="M12 5v14m-6-6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        send: '<svg viewBox="0 0 24 24"><path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        receive: '<svg viewBox="0 0 24 24"><path d="M19 12H7m5 6-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 11h7m-2 0v3m-2-3v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    var METHOD_NAMES = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', card: 'কার্ড', bank: 'ব্যাংক' };

    var balance = null;
    var hidden = false;
    var nextBefore = null;

    try { hidden = window.localStorage.getItem('joma.hideBalance') === '1'; } catch (e) { /* storage blocked */ }

    function esc(text) {
        return $('<div>').text(text == null ? '' : String(text)).html();
    }

    // Balance -----------------------------------------------------------------

    function renderBalance() {
        if (balance === null) { return; }
        $('#balance').toggleClass('is-hidden', hidden).text(hidden ? '৳ ••••••' : '৳ ' + Joma.taka(balance));
        $('#balance-toggle').text(hidden ? 'দেখুন' : 'লুকান').attr('aria-pressed', String(hidden));
    }

    function loadSummary() {
        return Joma.api('GET', 'wallet').then(function (res) {
            balance = res.balance;
            $('#month-in').text('৳ ' + Joma.taka(res.month_in));
            $('#month-out').text('৳ ' + Joma.taka(res.month_out));
            renderBalance();
        });
    }

    $('#balance-toggle').on('click', function () {
        hidden = !hidden;
        try { window.localStorage.setItem('joma.hideBalance', hidden ? '1' : '0'); } catch (e) { /* ignore */ }
        renderBalance();
    });

    // History -----------------------------------------------------------------

    function describe(tx) {
        var who = tx.counterparty ? tx.counterparty.name : 'মুছে ফেলা অ্যাকাউন্ট';
        switch (tx.type) {
            case 'deposit':
                return { cls: 'tx-in', icon: ICONS.in, title: 'টাকা যোগ', sub: METHOD_NAMES[tx.method] || '' };
            case 'withdraw':
                return { cls: 'tx-out', icon: ICONS.out, title: 'টাকা তোলা', sub: METHOD_NAMES[tx.method] || '' };
            case 'transfer_in':
                return { cls: 'tx-in', icon: ICONS.receive, title: who + ' পাঠিয়েছেন', sub: tx.note || '' };
            default:
                return { cls: 'tx-send', icon: ICONS.send, title: who + '-কে পাঠানো', sub: tx.note || '' };
        }
    }

    function txItem(tx, isNew) {
        var d = describe(tx);
        var sign = tx.direction === 'in' ? '+' : '−';
        var sub = [d.sub, Joma.date(tx.created_at)].filter(Boolean).join(' • ');
        return $('<li class="tx">').addClass(d.cls).toggleClass('tx-new', !!isNew).html(
            '<span class="tx-icon" aria-hidden="true">' + d.icon + '</span>' +
            '<div class="tx-body"><div class="tx-title">' + esc(d.title) + '</div>' +
            '<div class="tx-sub">' + esc(sub) + '</div></div>' +
            '<div class="tx-amount">' + sign + '৳' + Joma.taka(tx.amount) +
            '<small>ব্যালেন্স ৳' + Joma.taka(tx.balance_after) + '</small></div>'
        );
    }

    function loadTransactions(append) {
        var path = 'transactions' + (append && nextBefore ? '?before=' + nextBefore : '');
        var $more = $('#tx-more');
        if (append) { Joma.busy($more, true); }
        return Joma.api('GET', path).then(function (res) {
            var $list = $('#tx-list');
            if (!append) { $list.empty(); }
            res.transactions.forEach(function (tx) { $list.append(txItem(tx)); });
            $list.attr('aria-busy', 'false');
            nextBefore = res.next_before;
            $more.prop('hidden', !nextBefore);
            $('#tx-empty').prop('hidden', $list.children().length > 0);
        }).always(function () { Joma.busy($more, false); });
    }

    $('#tx-more').on('click', function () { loadTransactions(true); });

    // Dialogs -----------------------------------------------------------------

    function openDialog(id) {
        var dialog = document.getElementById(id);
        var $form = $(dialog).find('form');
        $form[0].reset();
        $form.find('[aria-invalid]').attr('aria-invalid', null);
        Joma.showFormError($form, null);
        $('#recipient').text('').removeClass('is-found is-missing');
        // A new key each time the form opens; retries of this submission reuse it.
        $form.data('idempotency-key', Joma.idempotencyKey());
        dialog.showModal();
        $form.find('input').first().trigger('focus');
    }

    $(document).on('click', '[data-open]', function () { openDialog($(this).data('open')); });
    $(document).on('click', '[data-close]', function () { this.closest('dialog').close(); });
    $('dialog').on('click', function (event) {
        if (event.target === this) { this.close(); } // click on the backdrop
    });

    $('.quick-amounts').on('click', 'button', function () {
        $(this).closest('form').find('[name=amount]').val($(this).data('amount')).trigger('focus');
    });

    // Converts Bengali digits typed on a Bengali keyboard to ASCII for the API.
    function asciiDigits(text) {
        return String(text).replace(/[০-৯]/g, function (d) { return String('০১২৩৪৫৬৭৮৯'.indexOf(d)); });
    }

    var lastLookup = '';
    $('#dlg-send [name=to_email]').on('blur', function () {
        var email = $.trim($(this).val());
        var $note = $('#recipient');
        if (!email || email === lastLookup) { return; }
        lastLookup = email;
        Joma.api('GET', 'users/lookup?email=' + encodeURIComponent(email)).then(function (res) {
            $note.text('✓ ' + res.name).removeClass('is-missing').addClass('is-found');
        }, function (error) {
            $note.text(error.message).removeClass('is-found').addClass('is-missing');
        });
    });

    var SUCCESS = {
        deposit: function (tx) { return '৳' + Joma.taka(tx.amount) + ' যোগ হয়েছে।'; },
        withdraw: function (tx) { return '৳' + Joma.taka(tx.amount) + ' তোলা হয়েছে।'; },
        transfer: function (tx) { return tx.counterparty.name + '-কে ৳' + Joma.taka(tx.amount) + ' পাঠানো হয়েছে।'; }
    };

    $('dialog form').on('submit', function (event) {
        event.preventDefault();
        var $form = $(this);
        var action = $form.data('action');
        var $amount = $form.find('[name=amount]');
        var data = {
            amount: asciiDigits($.trim($amount.val())).replace(/,/g, ''),
            idempotency_key: $form.data('idempotency-key')
        };
        if (action === 'transfer') {
            data.to_email = $.trim($form.find('[name=to_email]').val());
            data.note = $.trim($form.find('[name=note]').val());
            if (!data.to_email) {
                $form.find('[name=to_email]').attr('aria-invalid', 'true').trigger('focus');
                Joma.showFormError($form, 'প্রাপকের ইমেইল লিখুন।');
                return;
            }
        } else {
            data.method = $form.find('[name=method]:checked').val();
        }
        if (!/^\d+(\.\d{1,2})?$/.test(data.amount)) {
            $amount.attr('aria-invalid', 'true').trigger('focus');
            Joma.showFormError($form, 'সঠিক টাকার পরিমাণ লিখুন।');
            return;
        }

        var $button = $form.find('[type=submit]');
        Joma.showFormError($form, null);
        Joma.busy($button, true);
        Joma.api('POST', 'wallet/' + action, data).then(function (res) {
            $form.closest('dialog')[0].close();
            Joma.toast(SUCCESS[action](res.transaction));
            balance = res.balance;
            renderBalance();
            $('#tx-empty').prop('hidden', true);
            if (!res.replayed) { $('#tx-list').prepend(txItem(res.transaction, true)); }
            loadSummary();
        }, function (error) {
            Joma.showFormError($form, error.message);
        }).always(function () {
            Joma.busy($button, false);
        });
    });

    $('dialog input').on('input', function () { $(this).attr('aria-invalid', null); });

    // Passkeys ----------------------------------------------------------------

    function renderPasskeys(passkeys) {
        var $list = $('#passkey-list').empty();
        if (!passkeys.length) {
            $list.append('<li class="passkey-empty">এখনো কোনো পাসকি যোগ করা হয়নি</li>');
            return;
        }
        passkeys.forEach(function (pk) {
            var used = pk.last_used_at ? 'শেষ ব্যবহার ' + Joma.date(pk.last_used_at) : 'যোগ করা হয়েছে ' + Joma.date(pk.created_at);
            $list.append(
                $('<li class="passkey">').html(
                    '<span class="passkey-icon" aria-hidden="true">' + ICONS.key + '</span>' +
                    '<div><div class="passkey-name">' + esc(pk.name) + '</div><div class="passkey-meta">' + esc(used) + '</div></div>' +
                    '<button type="button" class="btn btn-ghost btn-sm" data-delete-passkey="' + pk.id + '">মুছুন</button>'
                ).find('button').attr('aria-label', pk.name + ' মুছুন').end()
            );
        });
    }

    function loadPasskeys() {
        return Joma.api('GET', 'passkeys').then(function (res) { renderPasskeys(res.passkeys); });
    }

    var $addPasskey = $('#passkey-add');
    if (!Joma.passkeysSupported()) {
        $addPasskey.prop('disabled', true).text('এই ব্রাউজারে পাসকি সমর্থিত নয়');
    }

    $addPasskey.on('click', function () {
        Joma.busy($addPasskey, true);
        var challengeId;
        Joma.api('POST', 'passkeys/options', {})
            .then(function (res) {
                challengeId = res.challenge_id;
                return navigator.credentials.create(Joma.creationOptions(res.options));
            })
            .then(function (credential) {
                return Joma.api('POST', 'passkeys', { challenge_id: challengeId, credential: Joma.credentialJSON(credential) });
            })
            .then(function () {
                Joma.toast('পাসকি যোগ হয়েছে। এখন থেকে পাসকি দিয়েই লগইন করতে পারবেন।');
                return loadPasskeys();
            }, function (error) {
                var message = Joma.passkeyError(error);
                if (message) { Joma.toast(message, true); }
            })
            .always(function () { Joma.busy($addPasskey, false); });
    });

    $('#passkey-list').on('click', '[data-delete-passkey]', function () {
        var $button = $(this);
        var name = $button.closest('.passkey').find('.passkey-name').text();
        if (!window.confirm('"' + name + '" পাসকি মুছে ফেলবেন? এই ডিভাইস দিয়ে আর পাসকি লগইন হবে না।')) { return; }
        Joma.busy($button, true);
        Joma.api('DELETE', 'passkeys/' + $button.data('delete-passkey')).then(function () {
            Joma.toast('পাসকি মুছে ফেলা হয়েছে।');
            loadPasskeys();
        }, function (error) {
            Joma.busy($button, false);
            Joma.toast(error.message, true);
        });
    });

    // Account -----------------------------------------------------------------

    $('#logout').on('click', function () {
        Joma.busy($(this), true);
        Joma.api('POST', 'auth/logout', {}).always(function () { window.location.href = 'index.php'; });
    });

    Joma.api('GET', 'me').then(function (res) {
        if (res.user.avatar_url) {
            $('#avatar').html($('<img alt="">').attr('src', res.user.avatar_url));
        }
    });

    $.when(loadSummary(), loadTransactions(false), loadPasskeys()).fail(function (error) {
        Joma.toast(error.message, true);
    });
})(jQuery, window, window.Joma);
