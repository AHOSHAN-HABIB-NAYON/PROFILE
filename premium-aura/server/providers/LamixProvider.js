'use strict';
const GenericHttpProvider = require('./GenericHttpProvider');

/** Lamix — /api/v1/messages?token=…&from=…&to=…&limit=… (token via LAMIX_API_TOKEN). */
class LamixProvider extends GenericHttpProvider {
  static type = 'lamix';

  static label = 'Lamix';

  connect() {
    const req = super.connect();
    const vars = this.templateVars();
    if (!req.url.searchParams.get('from')) req.url.searchParams.set('from', vars.window_start);
    if (!req.url.searchParams.get('to')) req.url.searchParams.set('to', vars.now);
    if (!req.url.searchParams.get('limit')) req.url.searchParams.set('limit', '100');
    return req;
  }
}
module.exports = LamixProvider;
