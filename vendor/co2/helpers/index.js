import { averageIntensity } from "../index.js";
import {
  GLOBAL_GRID_INTENSITY as SWDM3_GLOBAL_GRID_INTENSITY,
  SWDV4,
  PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD,
  FIRST_TIME_VIEWING_PERCENTAGE,
  RETURNING_VISITOR_PERCENTAGE,
  SWDMV3_RATINGS,
  SWDMV4_RATINGS
} from "../constants/index.js";
const SWDM4_GLOBAL_GRID_INTENSITY = SWDV4.GLOBAL_GRID_INTENSITY;
const formatNumber = (num) => parseFloat(num.toFixed(2));
const lessThanEqualTo = (num, limit) => num <= limit;
function parseByteTraceOptions(options = {}, version = 3, green = false) {
  const globalGridIntensity = version === 4 ? SWDM4_GLOBAL_GRID_INTENSITY : SWDM3_GLOBAL_GRID_INTENSITY;
  if (typeof options !== "object") {
    throw new Error("Options must be an object");
  }
  const adjustments = {};
  function setIntensity(segment, segmentIntensity) {
    var _a, _b;
    if (segmentIntensity || segmentIntensity === 0) {
      if (typeof segmentIntensity === "object") {
        if (!averageIntensity.data[(_a = segmentIntensity.country) == null ? void 0 : _a.toUpperCase()]) {
          console.warn(
            `"${segmentIntensity.country}" is not a valid country. Please use a valid 3 digit ISO 3166 country code. 
See https://developers.thegreenwebfoundation.org/co2js/data/ for more information. 
Falling back to global average grid intensity.`
          );
          adjustments.gridIntensity[segment] = {
            value: globalGridIntensity
          };
        }
        adjustments.gridIntensity[segment] = {
          country: segmentIntensity.country,
          value: parseFloat(
            averageIntensity.data[(_b = segmentIntensity.country) == null ? void 0 : _b.toUpperCase()]
          )
        };
      } else if (typeof segmentIntensity === "number") {
        adjustments.gridIntensity[segment] = {
          value: segmentIntensity
        };
      } else {
        adjustments.gridIntensity[segment] = {
          value: globalGridIntensity
        };
        console.warn(
          `The ${segment} grid intensity must be a number or an object. You passed in a ${typeof segmentIntensity}. 
Falling back to global average grid intensity.`
        );
      }
    } else {
      adjustments.gridIntensity[segment] = {
        value: globalGridIntensity
      };
    }
  }
  if (options == null ? void 0 : options.gridIntensity) {
    adjustments.gridIntensity = {};
    const { device, dataCenter, network } = options.gridIntensity;
    setIntensity("device", device);
    setIntensity("dataCenter", dataCenter);
    setIntensity("network", network);
  } else {
    adjustments.gridIntensity = {
      device: { value: globalGridIntensity },
      dataCenter: { value: globalGridIntensity },
      network: { value: globalGridIntensity }
    };
  }
  if ((options == null ? void 0 : options.greenHostingFactor) || options.greenHostingFactor === 0 && version === 4) {
    if (typeof options.greenHostingFactor === "number") {
      if (options.greenHostingFactor >= 0 && options.greenHostingFactor <= 1) {
        adjustments.greenHostingFactor = options.greenHostingFactor;
      } else {
        adjustments.greenHostingFactor = 0;
        console.warn(
          `The returnVisitPercentage option must be a number between 0 and 1. You passed in ${options.returnVisitPercentage}. 
Falling back to default value.`
        );
      }
    } else {
      adjustments.greenHostingFactor = 0;
      console.warn(
        `The returnVisitPercentage option must be a number. You passed in a ${typeof options.returnVisitPercentage}. 
Falling back to default value.`
      );
    }
  } else if (version === 4) {
    adjustments.greenHostingFactor = 0;
  }
  if (green) {
    adjustments.greenHostingFactor = 1;
  }
  return adjustments;
}
function parseVisitTraceOptions(options = {}, version = 3, green = false) {
  if (typeof options !== "object") {
    throw new Error("Options must be an object");
  }
  const adjustments = parseByteTraceOptions(options, version, green);
  if ((options == null ? void 0 : options.dataReloadRatio) || options.dataReloadRatio === 0) {
    if (typeof options.dataReloadRatio === "number") {
      if (options.dataReloadRatio >= 0 && options.dataReloadRatio <= 1) {
        adjustments.dataReloadRatio = options.dataReloadRatio;
      } else {
        adjustments.dataReloadRatio = version === 3 ? PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD : 0;
        console.warn(
          `The dataReloadRatio option must be a number between 0 and 1. You passed in ${options.dataReloadRatio}. 
Falling back to default value.`
        );
      }
    } else {
      adjustments.dataReloadRatio = version === 3 ? PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD : 0;
      console.warn(
        `The dataReloadRatio option must be a number. You passed in a ${typeof options.dataReloadRatio}. 
Falling back to default value.`
      );
    }
  } else {
    adjustments.dataReloadRatio = version === 3 ? PERCENTAGE_OF_DATA_LOADED_ON_SUBSEQUENT_LOAD : 0;
    console.warn(
      `The dataReloadRatio option must be a number. You passed in a ${typeof options.dataReloadRatio}. 
Falling back to default value.`
    );
  }
  if ((options == null ? void 0 : options.firstVisitPercentage) || options.firstVisitPercentage === 0) {
    if (typeof options.firstVisitPercentage === "number") {
      if (options.firstVisitPercentage >= 0 && options.firstVisitPercentage <= 1) {
        adjustments.firstVisitPercentage = options.firstVisitPercentage;
      } else {
        adjustments.firstVisitPercentage = version === 3 ? FIRST_TIME_VIEWING_PERCENTAGE : 1;
        console.warn(
          `The firstVisitPercentage option must be a number between 0 and 1. You passed in ${options.firstVisitPercentage}. 
Falling back to default value.`
        );
      }
    } else {
      adjustments.firstVisitPercentage = version === 3 ? FIRST_TIME_VIEWING_PERCENTAGE : 1;
      console.warn(
        `The firstVisitPercentage option must be a number. You passed in a ${typeof options.firstVisitPercentage}. 
Falling back to default value.`
      );
    }
  } else {
    adjustments.firstVisitPercentage = version === 3 ? FIRST_TIME_VIEWING_PERCENTAGE : 1;
    console.warn(
      `The firstVisitPercentage option must be a number. You passed in a ${typeof options.firstVisitPercentage}. 
Falling back to default value.`
    );
  }
  if ((options == null ? void 0 : options.returnVisitPercentage) || options.returnVisitPercentage === 0) {
    if (typeof options.returnVisitPercentage === "number") {
      if (options.returnVisitPercentage >= 0 && options.returnVisitPercentage <= 1) {
        adjustments.returnVisitPercentage = options.returnVisitPercentage;
      } else {
        adjustments.returnVisitPercentage = version === 3 ? RETURNING_VISITOR_PERCENTAGE : 0;
        console.warn(
          `The returnVisitPercentage option must be a number between 0 and 1. You passed in ${options.returnVisitPercentage}. 
Falling back to default value.`
        );
      }
    } else {
      adjustments.returnVisitPercentage = version === 3 ? RETURNING_VISITOR_PERCENTAGE : 0;
      console.warn(
        `The returnVisitPercentage option must be a number. You passed in a ${typeof options.returnVisitPercentage}. 
Falling back to default value.`
      );
    }
  } else {
    adjustments.returnVisitPercentage = version === 3 ? RETURNING_VISITOR_PERCENTAGE : 0;
    console.warn(
      `The returnVisitPercentage option must be a number. You passed in a ${typeof options.returnVisitPercentage}. 
Falling back to default value.`
    );
  }
  return adjustments;
}
function getApiRequestHeaders(comment = "") {
  return { "User-Agent": `co2js/${"0.16.4"} ${comment}` };
}
function outputRating(co2e, swdmVersion) {
  let {
    FIFTH_PERCENTILE,
    TENTH_PERCENTILE,
    TWENTIETH_PERCENTILE,
    THIRTIETH_PERCENTILE,
    FORTIETH_PERCENTILE,
    FIFTIETH_PERCENTILE
  } = SWDMV3_RATINGS;
  if (swdmVersion === 4) {
    FIFTH_PERCENTILE = SWDMV4_RATINGS.FIFTH_PERCENTILE;
    TENTH_PERCENTILE = SWDMV4_RATINGS.TENTH_PERCENTILE;
    TWENTIETH_PERCENTILE = SWDMV4_RATINGS.TWENTIETH_PERCENTILE;
    THIRTIETH_PERCENTILE = SWDMV4_RATINGS.THIRTIETH_PERCENTILE;
    FORTIETH_PERCENTILE = SWDMV4_RATINGS.FORTIETH_PERCENTILE;
    FIFTIETH_PERCENTILE = SWDMV4_RATINGS.FIFTIETH_PERCENTILE;
  }
  if (lessThanEqualTo(co2e, FIFTH_PERCENTILE)) {
    return "A+";
  } else if (lessThanEqualTo(co2e, TENTH_PERCENTILE)) {
    return "A";
  } else if (lessThanEqualTo(co2e, TWENTIETH_PERCENTILE)) {
    return "B";
  } else if (lessThanEqualTo(co2e, THIRTIETH_PERCENTILE)) {
    return "C";
  } else if (lessThanEqualTo(co2e, FORTIETH_PERCENTILE)) {
    return "D";
  } else if (lessThanEqualTo(co2e, FIFTIETH_PERCENTILE)) {
    return "E";
  } else {
    return "F";
  }
}
export {
  formatNumber,
  getApiRequestHeaders,
  lessThanEqualTo,
  outputRating,
  parseByteTraceOptions,
  parseVisitTraceOptions
};