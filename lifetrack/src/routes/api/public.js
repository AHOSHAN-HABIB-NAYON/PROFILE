'use strict';
const express = require('express');
const { ok } = require('../../lib/http');
const settings = require('../../services/settings');
const i18n = require('../../services/i18n');
const mailer = require('../../services/mailer');

const r = express.Router();
r.get('/config', (req, res) => {
  let fb = null;
  if (settings.bool('firebase_enabled')) { try { fb = JSON.parse(settings.get('firebase_web_config') || 'null'); } catch { fb = null; } }
  res.setHeader('Cache-Control', 'no-cache');
  ok(res, {
    site: settings.get('site_name'), tagline: settings.get('site_tagline'), logo: settings.get('logo_url'), logoShowName: settings.bool('logo_show_name'),
    registration: settings.bool('registration_enabled'), google: settings.bool('auth_google_enabled') && !!(process.env.GOOGLE_CLIENT_ID || settings.get('google_client_id')),
    passkeys: settings.bool('auth_passkey_enabled'), twoFactor: settings.bool('auth_2fa_enabled'), emailVerificationRequired: settings.bool('email_verification_required'),
    mail: mailer.enabled(), push: settings.bool('push_enabled') ? settings.get('vapid_public') : null,
    firebase: fb ? { config: fb, vapidKey: settings.get('firebase_vapid_key') } : null,
    languages: settings.get('languages_enabled').split(',').filter((l) => i18n.LOCALES.includes(l)).map((l) => ({ code: l, ...i18n.META[l] })),
    defaultLanguage: settings.get('default_language'), currencies: settings.currencies(), defaultCurrency: settings.get('default_currency'), maintenance: settings.bool('maintenance_mode'),
  });
});
r.get('/i18n/:locale', (req, res) => {
  const l = i18n.LOCALES.includes(req.params.locale) ? req.params.locale : 'en';
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(i18n.dict(l));
});
module.exports = r;
