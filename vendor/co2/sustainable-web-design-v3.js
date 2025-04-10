var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
import {
  fileSize,
  KWH_PER_GB,
  END_USER_DEVICE_ENERGY,
  NETWORK_ENERGY,
  DATACENTER_ENERGY,
  PRODUCTION_ENERGY,
  GLOBAL_GRID_INTENSITY,
  RENEWABLES_GRID_INTENSITY,
  FIRST_TIME_VIEWING_PERCENTAGE,
  RETURNING_VISITOR_PERCENTAGE,
  PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD
} from "./constants/index.js";
import { formatNumber, outputRating } from "./helpers/index.js";
class SustainableWebDesign {
  constructor(options) {
    this.allowRatings = true;
    this.options = options;
    this.version = 3;
  }
  energyPerByteByComponent(bytes) {
    const transferedBytesToGb = bytes / fileSize.GIGABYTE;
    const energyUsage = transferedBytesToGb * KWH_PER_GB;
    return {
      consumerDeviceEnergy: energyUsage * END_USER_DEVICE_ENERGY,
      networkEnergy: energyUsage * NETWORK_ENERGY,
      productionEnergy: energyUsage * PRODUCTION_ENERGY,
      dataCenterEnergy: energyUsage * DATACENTER_ENERGY
    };
  }
  co2byComponent(energyByComponent, carbonIntensity = GLOBAL_GRID_INTENSITY, options = {}) {
    let deviceCarbonIntensity = GLOBAL_GRID_INTENSITY;
    let networkCarbonIntensity = GLOBAL_GRID_INTENSITY;
    let dataCenterCarbonIntensity = GLOBAL_GRID_INTENSITY;
    let globalEmissions = GLOBAL_GRID_INTENSITY;
    if (options == null ? void 0 : options.gridIntensity) {
      const { device, network, dataCenter } = options.gridIntensity;
      if ((device == null ? void 0 : device.value) || (device == null ? void 0 : device.value) === 0) {
        deviceCarbonIntensity = device.value;
      }
      if ((network == null ? void 0 : network.value) || (network == null ? void 0 : network.value) === 0) {
        networkCarbonIntensity = network.value;
      }
      if ((dataCenter == null ? void 0 : dataCenter.value) || (dataCenter == null ? void 0 : dataCenter.value) === 0) {
        dataCenterCarbonIntensity = dataCenter.value;
      }
    }
    if (carbonIntensity === true) {
      dataCenterCarbonIntensity = RENEWABLES_GRID_INTENSITY;
    }
    const returnCO2ByComponent = {};
    for (const [key, value] of Object.entries(energyByComponent)) {
      if (key.startsWith("dataCenterEnergy")) {
        returnCO2ByComponent[key.replace("Energy", "CO2")] = value * dataCenterCarbonIntensity;
      } else if (key.startsWith("consumerDeviceEnergy")) {
        returnCO2ByComponent[key.replace("Energy", "CO2")] = value * deviceCarbonIntensity;
      } else if (key.startsWith("networkEnergy")) {
        returnCO2ByComponent[key.replace("Energy", "CO2")] = value * networkCarbonIntensity;
      } else {
        returnCO2ByComponent[key.replace("Energy", "CO2")] = value * globalEmissions;
      }
    }
    return returnCO2ByComponent;
  }
  perByte(bytes, carbonIntensity = false, segmentResults = false, ratingResults = false, options = {}) {
    if (bytes < 1) {
      bytes = 0;
    }
    const energyBycomponent = this.energyPerByteByComponent(bytes, options);
    if (typeof carbonIntensity !== "boolean") {
      throw new Error(
        `perByte expects a boolean for the carbon intensity value. Received: ${carbonIntensity}`
      );
    }
    const co2ValuesbyComponent = this.co2byComponent(
      energyBycomponent,
      carbonIntensity,
      options
    );
    const co2Values = Object.values(co2ValuesbyComponent);
    const co2ValuesSum = co2Values.reduce(
      (prevValue, currentValue) => prevValue + currentValue
    );
    let rating = null;
    if (ratingResults) {
      rating = this.ratingScale(co2ValuesSum);
    }
    if (segmentResults) {
      if (ratingResults) {
        return __spreadProps(__spreadValues({}, co2ValuesbyComponent), {
          total: co2ValuesSum,
          rating
        });
      }
      return __spreadProps(__spreadValues({}, co2ValuesbyComponent), { total: co2ValuesSum });
    }
    if (ratingResults) {
      return { total: co2ValuesSum, rating };
    }
    return co2ValuesSum;
  }
  perVisit(bytes, carbonIntensity = false, segmentResults = false, ratingResults = false, options = {}) {
    const energyBycomponent = this.energyPerVisitByComponent(bytes, options);
    if (typeof carbonIntensity !== "boolean") {
      throw new Error(
        `perVisit expects a boolean for the carbon intensity value. Received: ${carbonIntensity}`
      );
    }
    const co2ValuesbyComponent = this.co2byComponent(
      energyBycomponent,
      carbonIntensity,
      options
    );
    const co2Values = Object.values(co2ValuesbyComponent);
    const co2ValuesSum = co2Values.reduce(
      (prevValue, currentValue) => prevValue + currentValue
    );
    let rating = null;
    if (ratingResults) {
      rating = this.ratingScale(co2ValuesSum);
    }
    if (segmentResults) {
      if (ratingResults) {
        return __spreadProps(__spreadValues({}, co2ValuesbyComponent), {
          total: co2ValuesSum,
          rating
        });
      }
      return __spreadProps(__spreadValues({}, co2ValuesbyComponent), { total: co2ValuesSum });
    }
    if (ratingResults) {
      return { total: co2ValuesSum, rating };
    }
    return co2ValuesSum;
  }
  energyPerByte(bytes) {
    const energyByComponent = this.energyPerByteByComponent(bytes);
    const energyValues = Object.values(energyByComponent);
    return energyValues.reduce(
      (prevValue, currentValue) => prevValue + currentValue
    );
  }
  energyPerVisitByComponent(bytes, options = {}, firstView = FIRST_TIME_VIEWING_PERCENTAGE, returnView = RETURNING_VISITOR_PERCENTAGE, dataReloadRatio = PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD) {
    if (options.dataReloadRatio || options.dataReloadRatio === 0) {
      dataReloadRatio = options.dataReloadRatio;
    }
    if (options.firstVisitPercentage || options.firstVisitPercentage === 0) {
      firstView = options.firstVisitPercentage;
    }
    if (options.returnVisitPercentage || options.returnVisitPercentage === 0) {
      returnView = options.returnVisitPercentage;
    }
    const energyBycomponent = this.energyPerByteByComponent(bytes);
    const cacheAdjustedSegmentEnergy = {};
    const energyValues = Object.values(energyBycomponent);
    for (const [key, value] of Object.entries(energyBycomponent)) {
      cacheAdjustedSegmentEnergy[`${key} - first`] = value * firstView;
      cacheAdjustedSegmentEnergy[`${key} - subsequent`] = value * returnView * dataReloadRatio;
    }
    return cacheAdjustedSegmentEnergy;
  }
  energyPerVisit(bytes) {
    let firstVisits = 0;
    let subsequentVisits = 0;
    const energyBycomponent = Object.entries(
      this.energyPerVisitByComponent(bytes)
    );
    for (const [key, val] of energyBycomponent) {
      if (key.indexOf("first") > 0) {
        firstVisits += val;
      }
    }
    for (const [key, val] of energyBycomponent) {
      if (key.indexOf("subsequent") > 0) {
        subsequentVisits += val;
      }
    }
    return firstVisits + subsequentVisits;
  }
  emissionsPerVisitInGrams(energyPerVisit, carbonintensity = GLOBAL_GRID_INTENSITY) {
    return formatNumber(energyPerVisit * carbonintensity);
  }
  annualEnergyInKwh(energyPerVisit, monthlyVisitors = 1e3) {
    return energyPerVisit * monthlyVisitors * 12;
  }
  annualEmissionsInGrams(co2grams, monthlyVisitors = 1e3) {
    return co2grams * monthlyVisitors * 12;
  }
  annualSegmentEnergy(annualEnergy) {
    return {
      consumerDeviceEnergy: formatNumber(annualEnergy * END_USER_DEVICE_ENERGY),
      networkEnergy: formatNumber(annualEnergy * NETWORK_ENERGY),
      dataCenterEnergy: formatNumber(annualEnergy * DATACENTER_ENERGY),
      productionEnergy: formatNumber(annualEnergy * PRODUCTION_ENERGY)
    };
  }
  ratingScale(co2e) {
    return outputRating(co2e, this.version);
  }
}
var sustainable_web_design_v3_default = SustainableWebDesign;
export {
  SustainableWebDesign,
  sustainable_web_design_v3_default as default
};