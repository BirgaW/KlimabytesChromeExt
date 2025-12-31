var __defProp = Object.defineProperty;
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
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};

import SustainableWebDesignV4 from "./sustainable-web-design-v4.js";
import {
  parseByteTraceOptions
} from "./helpers/index.js";
class CO2 {
  constructor(options) {
    this.model = new SustainableWebDesignV4();
    if ((options == null ? void 0 : options.rating) && typeof options.rating !== "boolean") {
      throw new Error(
        `The rating option must be a boolean. Please use true or false.
See https://developers.thegreenwebfoundation.org/co2js/options/ to learn more about the options available in CO2.js.`
      );
    }
    const allowRatings = !!this.model.allowRatings;
    this._segment = (options == null ? void 0 : options.results) === "segment";
    this._rating = (options == null ? void 0 : options.rating) === true;
    if (!allowRatings && this._rating) {
      throw new Error(
        `The rating system is not supported in the model you are using. Try using the Sustainable Web Design model instead.
See https://developers.thegreenwebfoundation.org/co2js/models/ to learn more about the models available in CO2.js.`
      );
    }
  }
  perByte(bytes, green = false) {
    return this.model.perByte(bytes, green, this._segment, this._rating);
  }
  perByteTrace(bytes, green = false, options = {}) {
    const adjustments = parseByteTraceOptions(
      options,
      this.model.version,
      green
    );
    const _a = adjustments, { gridIntensity } = _a, traceVariables = __objRest(_a, ["gridIntensity"]);
    const _b = traceVariables, {
      dataReloadRatio,
      firstVisitPercentage,
      returnVisitPercentage
    } = _b, otherVariables = __objRest(_b, [
      "dataReloadRatio",
      "firstVisitPercentage",
      "returnVisitPercentage"
    ]);
    return {
      co2: this.model.perByte(
        bytes,
        green,
        this._segment,
        this._rating,
        adjustments
      ),
      green,
      variables: __spreadValues({
        description: "Below are the variables used to calculate this CO2 estimate.",
        bytes,
        gridIntensity: __spreadValues({
          description: "The grid intensity (grams per kilowatt-hour) used to calculate this CO2 estimate."
        }, adjustments.gridIntensity)
      }, otherVariables)
    };
  }
 
  SustainableWebDesignV4() {
    return new SustainableWebDesignV4();
  }
}
var co2_default = CO2;
export {
  CO2,
  co2_default as default
};