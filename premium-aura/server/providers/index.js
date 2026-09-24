'use strict';
/**
 * Provider registry. To add a provider: create a class extending
 * GenericHttpProvider (or implementing ApiProviderInterface) and add it here.
 */
const GenericHttpProvider = require('./GenericHttpProvider');
const TelerouteXProvider = require('./TelerouteXProvider');
const ThirdWaveProvider = require('./ThirdWaveProvider');
const LamixProvider = require('./LamixProvider');
const EnterpriseSmsProvider = require('./EnterpriseSmsProvider');
const Two009Provider = require('./Two009Provider');

const REGISTRY = new Map(
  [GenericHttpProvider, TelerouteXProvider, ThirdWaveProvider, LamixProvider, EnterpriseSmsProvider, Two009Provider]
    .map((C) => [C.type, C]),
);

function create(row, ctx) {
  const C = REGISTRY.get(row.provider_type) || GenericHttpProvider;
  return new C(row, ctx);
}

function types() {
  return [...REGISTRY.values()].map((C) => ({ type: C.type, label: C.label }));
}

module.exports = { create, types, REGISTRY };
