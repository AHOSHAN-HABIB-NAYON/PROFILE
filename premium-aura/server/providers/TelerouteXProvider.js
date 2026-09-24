'use strict';
const GenericHttpProvider = require('./GenericHttpProvider');

/** TelerouteX — message data records (viewstats). Key supplied via TELEROUTEX_API_KEY. */
class TelerouteXProvider extends GenericHttpProvider {
  static type = 'teleroutex';

  static label = 'TelerouteX';

  extractRecords(data) {
    const recs = super.extractRecords(data);
    if (recs.length) return recs;
    return Array.isArray(data?.mdr) ? data.mdr : Array.isArray(data?.stats) ? data.stats : [];
  }
}
module.exports = TelerouteXProvider;
