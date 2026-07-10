(function (global) {
  'use strict';

  const EPS = 1e-9;

  function parseLocaleNumber(value, options = {}) {
    const { monetary = false } = options;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let raw = String(value ?? '').trim().replace(/\s+/g, '');
    if (!raw) return NaN;
    if (!/^[+-]?[\d.,]+$/.test(raw)) return NaN;

    const sign = raw.startsWith('-') ? -1 : 1;
    raw = raw.replace(/^[+-]/, '');
    const commaCount = (raw.match(/,/g) || []).length;
    const dotCount = (raw.match(/\./g) || []).length;

    if (commaCount && dotCount) {
      const decimalSeparator = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
      const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
      raw = raw.split(thousandsSeparator).join('');
      raw = raw.replace(decimalSeparator, '.');
      return sign * Number(raw);
    }

    if (commaCount) {
      if (commaCount > 1) {
        const groups = raw.split(',');
        if (groups.slice(1).every(g => g.length === 3)) return sign * Number(groups.join(''));
        return NaN;
      }
      return sign * Number(raw.replace(',', '.'));
    }

    if (dotCount) {
      if (dotCount > 1) {
        const groups = raw.split('.');
        if (groups.slice(1).every(g => g.length === 3)) return sign * Number(groups.join(''));
        return NaN;
      }
      const [left, right] = raw.split('.');
      if (monetary && right.length === 3 && left.length >= 1) return sign * Number(left + right);
      return sign * Number(raw);
    }

    return sign * Number(raw);
  }

  function agencyResidualRate(v) {
    const ota = v.otaCommission / 100;
    const agency = v.agencyCommission / 100;
    return v.agencyCommissionBase === 'afterOta' ? (1 - ota) * (1 - agency) : 1 - ota - agency;
  }

  function modeCosts(v, mode) {
    const prefix = mode === 'aut' ? 'aut' : 'agency';
    let total = 0;
    if (v[`${prefix}IncludeCleaning`]) total += v[`${prefix}Cleaning`];
    if (v[`${prefix}IncludeFixed`]) total += v[`${prefix}Fixed`];
    if (v[`${prefix}IncludeMaintenance`]) total += v[`${prefix}Maintenance`];
    if (mode === 'agency' && v.agencyIncludeExtra) total += v.agencyExtra;
    return total;
  }

  function taxFactor(v) { return v.includeTaxes ? 1 - v.taxRate / 100 : 1; }
  function netFromGross(gross, residual, costs, factor) { return (gross * residual - costs) * factor; }
  function grossForTargetNet(targetNet, residual, costs, factor) {
    if (!(residual > EPS) || !(factor > EPS)) return NaN;
    return (targetNet / factor + costs) / residual;
  }

  function calculate(v, grossOverride = null) {
    const available = v.rooms * v.days;
    const sold = available * (v.occupancy / 100);
    const gross = grossOverride ?? sold * v.averagePrice;
    const autResidual = 1 - v.otaCommission / 100;
    const agencyResidual = agencyResidualRate(v);
    const autCosts = modeCosts(v, 'aut');
    const agencyCosts = modeCosts(v, 'agency');
    const factor = taxFactor(v);
    const autNet = netFromGross(gross, autResidual, autCosts, factor);
    const agencyNet = netFromGross(gross, agencyResidual, agencyCosts, factor);
    const breakEvenGross = grossForTargetNet(autNet, agencyResidual, agencyCosts, factor);
    const targetNet = autNet * (1 + v.desiredIncrease / 100);
    const higherGross = grossForTargetNet(targetNet, agencyResidual, agencyCosts, factor);
    const goalGrossAut = grossForTargetNet(v.minimumNet, autResidual, autCosts, factor);
    const goalGrossAgency = grossForTargetNet(v.minimumNet, agencyResidual, agencyCosts, factor);
    const otaCost = gross * v.otaCommission / 100;
    const agencyCommissionBaseAmount = v.agencyCommissionBase === 'afterOta' ? gross - otaCost : gross;
    const agencyCost = agencyCommissionBaseAmount * v.agencyCommission / 100;

    return {
      available, sold, avgOccupied: sold / v.days, gross,
      autResidual, agencyResidual, autCosts, agencyCosts, taxFactor: factor,
      otaCost, agencyCommissionBaseAmount, agencyCost,
      autNet, agencyNet, autAnnual: autNet * 12, agencyAnnual: agencyNet * 12,
      breakEvenGross, breakEvenEuro: breakEvenGross - gross,
      breakEvenPct: gross > EPS ? (breakEvenGross / gross - 1) * 100 : NaN,
      targetNet, higherGross, higherEuro: higherGross - gross,
      higherPct: gross > EPS ? (higherGross / gross - 1) * 100 : NaN,
      goalGrossAut, goalGrossAgency
    };
  }

  function requiredOccupancy(v, mode) {
    const residual = mode === 'aut' ? 1 - v.otaCommission / 100 : agencyResidualRate(v);
    const costs = modeCosts(v, mode);
    const factor = taxFactor(v);
    const gross = grossForTargetNet(v.minimumNet, residual, costs, factor);
    if (!Number.isFinite(gross) || !(v.averagePrice > EPS) || !(v.rooms > EPS) || !(v.days > EPS)) return null;
    const nights = gross / v.averagePrice;
    return { gross, nights, roomsPerDay: nights / v.days, occupancy: nights / (v.rooms * v.days) * 100 };
  }

  function validate(v) {
    const errors = [];
    [['rooms','Numero di camere'],['days','Giorni del mese'],['averagePrice','Prezzo medio per notte']].forEach(([key,label]) => {
      if (!Number.isFinite(v[key])) errors.push(`${label}: inserisci un numero valido.`);
      else if (v[key] <= 0) errors.push(`${label}: deve essere maggiore di zero.`);
    });
    if (!Number.isFinite(v.minimumNet)) errors.push('Obiettivo netto mensile: inserisci un numero valido.');
    else if (v.minimumNet < 0) errors.push('Obiettivo netto mensile: non può essere negativo.');
    ['occupancy','otaCommission','agencyCommission','desiredIncrease','taxRate'].forEach(key => {
      if (!Number.isFinite(v[key])) errors.push(`${key}: inserisci una percentuale valida.`);
      else if (v[key] < 0 || v[key] > 100) errors.push(`${key}: deve essere compresa tra 0 e 100.`);
    });
    ['autCleaning','autFixed','autMaintenance','agencyCleaning','agencyFixed','agencyExtra','agencyMaintenance'].forEach(key => {
      if (!Number.isFinite(v[key])) errors.push(`${key}: inserisci un importo valido.`);
      else if (v[key] < 0) errors.push(`${key}: non può essere negativo.`);
    });
    if (!(1 - v.otaCommission / 100 > EPS)) errors.push('La commissione OTA lascia una percentuale residua nulla: il calcolo autonomo è impossibile.');
    if (!(agencyResidualRate(v) > EPS)) errors.push('Le commissioni selezionate lasciano una percentuale residua nulla o negativa per l’agenzia.');
    if (!(taxFactor(v) > EPS)) errors.push('Il fattore imposte deve essere maggiore di zero: usa un’aliquota inferiore al 100%.');
    return [...new Set(errors)];
  }

  function allCostsEnabled(v) {
    return v.includeTaxes && v.autIncludeCleaning && v.autIncludeFixed && v.autIncludeMaintenance &&
      v.agencyIncludeCleaning && v.agencyIncludeFixed && v.agencyIncludeMaintenance && v.agencyIncludeExtra;
  }

  global.AppCore = { parseLocaleNumber, agencyResidualRate, modeCosts, taxFactor, netFromGross, grossForTargetNet, calculate, requiredOccupancy, validate, allCostsEnabled };
})(typeof window !== 'undefined' ? window : globalThis);