/** Public surface of the pure decision engine. */

export { compareRotations } from "./compare.js";
export { assertEngineInput, SyntheticDataRejected, candidateIds } from "./input.js";
export type {
  DemandClass,
  EngineCropDef,
  EngineInput,
  EnginePhaseData,
  EnginePhaseSeries,
  EngineRotationDef,
} from "./input.js";
export { evaluateC3 } from "./criteria.js";
export {
  BASE_WEIGHTS,
  COMPONENT_LABELS,
  CRITERIA_ORDER,
  ENGINE_VERSION,
  GATE,
  MIN_MEANINGFUL_DELTA,
  PRIORITY_OF,
  RULE_IDS,
  THRESHOLDS,
} from "./config.js";
