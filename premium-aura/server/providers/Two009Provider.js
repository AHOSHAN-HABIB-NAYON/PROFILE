'use strict';
const GenericHttpProvider = require('./GenericHttpProvider');

/** 2oo9 Cloud token API: GET /success-otp with the key in the `mauthapi` header; records in data.otps. */
class Two009Provider extends GenericHttpProvider {
  static type = 'two009';

  static label = '2oo9 Cloud';
}
module.exports = Two009Provider;
