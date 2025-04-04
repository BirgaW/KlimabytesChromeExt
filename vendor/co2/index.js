import co2 from "./co2.js";
import hosting from "./hosting.js";
import averageIntensity from "./data/average-intensities.min.js";
import marginalIntensity from "./data/marginal-intensities-2021.min.js";
var src_default = { co2, hosting, averageIntensity, marginalIntensity };
export {
  averageIntensity,
  co2,
  src_default as default,
  hosting,
  marginalIntensity
};