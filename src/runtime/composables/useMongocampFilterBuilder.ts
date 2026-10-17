import {
  buildCondition,
  buildFilterQuery,
  conditionValueText,
  countActiveConditions,
  operatorLabelKey,
  operatorsFor,
  toFilterFieldType,
  valueCountFor,
} from '../utils/filterBuilder'

export type { FilterCondition, FilterFieldType, FilterGroup, FilterOperator } from '../utils/filterBuilder'

export function useMongocampFilterBuilder() {
  return { operatorsFor, valueCountFor, toFilterFieldType, operatorLabelKey, conditionValueText, buildCondition, buildFilterQuery, countActiveConditions }
}
