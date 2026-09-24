'use strict';
const GenericHttpProvider = require('./GenericHttpProvider');

/** ThirdWave — /api/v1/traffic?page=1&pageSize=50, Authorization: Bearer THIRDWAVE_API_KEY. */
class ThirdWaveProvider extends GenericHttpProvider {
  static type = 'thirdwave';

  static label = 'ThirdWave';

  connect() {
    const req = super.connect();
    if (!req.url.searchParams.has('page')) req.url.searchParams.set('page', '1');
    if (!req.url.searchParams.has('pageSize')) req.url.searchParams.set('pageSize', '50');
    return req;
  }

  extractRecords(data) {
    const recs = super.extractRecords(data);
    return recs.length ? recs : (Array.isArray(data?.traffic) ? data.traffic : []);
  }
}
module.exports = ThirdWaveProvider;
