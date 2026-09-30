'use strict';
/** Content-hash versions for static files so browsers can cache them "forever". */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const PUBLIC = path.join(__dirname, '..', 'public');
const versions = {};

/** Custom PWA icons (generated from the uploaded logo) live with the uploads so deploys keep them. */
function customIconsDir() { return path.join(path.dirname(config.uploadsDir()), 'icons'); }

function resolve(rel) {
  if (rel.startsWith('icons/') && config.get()) {
    const custom = path.join(customIconsDir(), rel.slice(6));
    if (fs.existsSync(custom)) return custom;
  }
  return path.join(PUBLIC, rel);
}
function v(rel) {
  if (versions[rel]) return versions[rel];
  try {
    versions[rel] = crypto.createHash('md5').update(fs.readFileSync(resolve(rel))).digest('hex').slice(0, 10);
  } catch (_) { versions[rel] = String(Date.now()); }
  return versions[rel];
}
function asset(rel) { return `/${rel}?v=${v(rel)}`; }
function reset() { for (const k of Object.keys(versions)) delete versions[k]; }

module.exports = { asset, v, reset, PUBLIC, customIconsDir };
