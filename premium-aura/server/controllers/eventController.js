'use strict';
const settings = require('../models/settings');
const { E } = require('../utils/errors');
const events = require('../services/events');
const { paginate, meta } = require('../utils/pagination');

const RESTRICTED_OTP = 'Your access to OTPs has been restricted. Please contact support.';
const restrictedOtp = (req) => { if (req.user.block_otp && req.user.role !== 'admin') throw E.forbidden(RESTRICTED_OTP, { code: 'RESTRICTED_OTP' }); };

exports.activity = async (req, res) => {
  restrictedOtp(req);
  res.json({ ok: true, ...(await events.activity(15, await settings.getBool('live_activity_show_code'))) });
};

exports.feed = async (req, res) => {
  restrictedOtp(req);
  const size = await settings.getInt('feed_page_size', 30);
  const p = paginate(req.query, { defaultSize: size, maxSize: 100 });
  const app = typeof req.query.app === 'string' ? req.query.app.toUpperCase() : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : null;
  const out = await events.feed(req.user, { page: p.page, size: p.size, app, q });
  res.json({
    ok: true, items: out.items, pagination: meta(out.total, p), live_total: out.live_total, demo_total: out.demo_total, public_feed: out.public_feed,
    expiration_hours: await events.expirationHours(), transport: { socket: true, poll_interval_ms: 5000 },
  });
};
