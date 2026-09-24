'use strict';
const GenericHttpProvider = require('./GenericHttpProvider');

/** 2oo9 Cloud public API (credential via TWO009_API_KEY). */
class Two009Provider extends GenericHttpProvider {
  static type = 'two009';

  static label = '2oo9 Cloud';
}
module.exports = Two009Provider;
