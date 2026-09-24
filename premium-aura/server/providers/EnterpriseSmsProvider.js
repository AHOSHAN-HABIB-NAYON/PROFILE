'use strict';
const GenericHttpProvider = require('./GenericHttpProvider');

/** EnterpriseSMS — /api/export?otp_only=true (token via ENTERPRISESMS_API_TOKEN). */
class EnterpriseSmsProvider extends GenericHttpProvider {
  static type = 'enterprisesms';

  static label = 'EnterpriseSMS';

  connect() {
    const req = super.connect();
    req.url.searchParams.set('otp_only', 'true');
    return req;
  }
}
module.exports = EnterpriseSmsProvider;
