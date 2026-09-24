'use strict';
/**
 * Contract every event provider implements. The poller only talks to this
 * interface, so new providers can be added by dropping a class into
 * server/providers and registering it in providers/index.js.
 *
 * Standard normalized event:
 *   { id, country, country_code, service, application, code, resource, received_at, status }
 *
 * Only the extracted code is kept. Full message bodies are never stored or
 * returned to clients.
 */
class ApiProviderInterface {
  /** @param {object} row api_providers row  @param {object} ctx { credential, mappings } */
  constructor(row, ctx = {}) {
    if (new.target === ApiProviderInterface) throw new TypeError('ApiProviderInterface is abstract');
    this.row = row;
    this.credential = ctx.credential || null; // server-side only
    this.mappings = ctx.mappings || [];
  }

  /** Prepare the request (URL, headers). Must not perform network I/O. */
  // eslint-disable-next-line class-methods-use-this
  connect() { throw new Error('connect() not implemented'); }

  /** Fetch raw records from the provider. Returns { records: any[], httpStatus, durationMs }. */
  // eslint-disable-next-line class-methods-use-this
  async fetch() { throw new Error('fetch() not implemented'); }

  /** Convert one raw record into the standard structure (or null to skip). */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  normalize(record) { throw new Error('normalize() not implemented'); }

  /** Validate a normalized event. Returns { ok: boolean, reason?: string }. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  validate(event) { throw new Error('validate() not implemented'); }

  /** Lightweight reachability/auth check → { status: 'online'|'offline'|'error', message, httpStatus } */
  // eslint-disable-next-line class-methods-use-this
  async healthCheck() { throw new Error('healthCheck() not implemented'); }
}

module.exports = ApiProviderInterface;
