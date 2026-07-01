export interface ColumnDefinition {
  columnName: string
  columnKey: string
  columnType: string
  required: boolean
  /** For columnType === 'array': the inferred type of the array elements */
  arrayItemType?: string
  /** For columnType === 'object', or 'array' with arrayItemType === 'object': the inferred nested fields */
  children?: ColumnDefinition[]
}

const DATE_TIME_STRING_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

function isDateTimeString(value: string): boolean {
  return DATE_TIME_STRING_REGEX.test(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function detectValueType(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return isDateTimeString(value) ? 'date-time' : 'string'
  if (Array.isArray(value)) return 'array'
  if (isPlainObject(value)) {
    if ('$date' in value) return 'date-time'
    if ('$oid' in value) return 'string'
    if ('$numberInt' in value || '$numberLong' in value || '$numberDouble' in value || '$numberDecimal' in value) return 'number'
    return 'object'
  }
  return 'string'
}

function orderFields(fields: string[]): string[] {
  const sortedFields: string[] = []
  if (fields.includes('_id')) {
    sortedFields.push('_id')
  }
  sortedFields.push(...fields.filter(f => f !== '_id' && f !== 'metaData').sort())
  if (fields.includes('metaData')) {
    sortedFields.push('metaData')
  }
  return sortedFields
}

function fieldsFromRecords(records: Array<Record<string, unknown>>): ColumnDefinition[] {
  const fieldKeys = new Set<string>()
  const fieldValueCounts = new Map<string, number>()
  const fieldTypes = new Map<string, Set<string>>()
  const fieldValues = new Map<string, unknown[]>()

  records.forEach((record) => {
    Object.entries(record).forEach(([key, value]) => {
      fieldKeys.add(key)
      const type = detectValueType(value)
      if (type) {
        fieldValueCounts.set(key, (fieldValueCounts.get(key) ?? 0) + 1)
        if (!fieldTypes.has(key)) {
          fieldTypes.set(key, new Set())
        }
        fieldTypes.get(key)!.add(type)
      }
      if (value !== null && value !== undefined) {
        if (!fieldValues.has(key)) {
          fieldValues.set(key, [])
        }
        fieldValues.get(key)!.push(value)
      }
    })
  })

  return orderFields(Array.from(fieldKeys)).map((key) => {
    const types = fieldTypes.get(key)
    const columnType = types && types.size === 1 ? [...types][0]! : 'string'
    const column: ColumnDefinition = {
      columnName: key,
      columnKey: key,
      columnType,
      required: fieldValueCounts.get(key) === records.length,
    }

    if (columnType === 'object') {
      const objectValues = (fieldValues.get(key) ?? []).filter(isPlainObject)
      column.children = fieldsFromRecords(objectValues)
    }
    else if (columnType === 'array') {
      const items = (fieldValues.get(key) ?? []).filter(Array.isArray).flat()
      const itemTypes = new Set<string>()
      items.forEach((item) => {
        const itemType = detectValueType(item)
        if (itemType) itemTypes.add(itemType)
      })
      column.arrayItemType = itemTypes.size === 1 ? [...itemTypes][0]! : itemTypes.size === 0 ? 'unknown' : 'string'
      if (column.arrayItemType === 'object') {
        column.children = fieldsFromRecords(items.filter(isPlainObject))
      }
    }

    return column
  })
}

const TS_SCALAR_TYPES: Record<string, string> = {
  'string': 'string',
  'number': 'number',
  'integer': 'number',
  'date-time': 'string',
  'boolean': 'boolean',
}

const IDENTIFIER_REGEX = /^[a-z_$][\w$]*$/i

function toPascalCase(value: string): string {
  const parts = value.split(/[^a-z0-9]+/i).filter(Boolean)
  return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('') || 'Document'
}

function singularize(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y')
  if (/(?:[sxz]|ch|sh)es$/i.test(word)) return word.replace(/es$/i, '')
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, '')
  return word
}

function tsTypeForColumn(col: ColumnDefinition, parentName: string, extraInterfaces: string[]): string {
  if (col.columnType === 'object') {
    if (!col.children?.length) return 'Record<string, unknown>'
    const name = `${parentName}${toPascalCase(col.columnKey)}`
    extraInterfaces.push(buildInterfaceBlock(name, col.children, extraInterfaces))
    return name
  }
  if (col.columnType === 'array') {
    if (col.arrayItemType === 'object') {
      if (!col.children?.length) return 'Record<string, unknown>[]'
      const name = `${parentName}${toPascalCase(singularize(col.columnKey))}`
      extraInterfaces.push(buildInterfaceBlock(name, col.children, extraInterfaces))
      return `${name}[]`
    }
    const itemType = col.arrayItemType ? (TS_SCALAR_TYPES[col.arrayItemType] ?? 'unknown') : 'unknown'
    return `${itemType}[]`
  }
  return TS_SCALAR_TYPES[col.columnType] ?? 'unknown'
}

function buildInterfaceBlock(name: string, columns: ColumnDefinition[], extraInterfaces: string[]): string {
  const lines = columns.map((col) => {
    const key = IDENTIFIER_REGEX.test(col.columnKey) ? col.columnKey : `'${col.columnKey}'`
    const optionalMarker = col.required ? '' : '?'
    const tsType = tsTypeForColumn(col, name, extraInterfaces)
    return `  ${key}${optionalMarker}: ${tsType}`
  })
  return `interface ${name} {\n${lines.join('\n')}\n}`
}

export function useMongocampSchema() {
  function schemaFromSamples(records: Array<Record<string, unknown>>): ColumnDefinition[] {
    return fieldsFromRecords(records)
  }

  function schemaToTsInterface(columns: ColumnDefinition[], interfaceName: string): string {
    const extraInterfaces: string[] = []
    const rootBlock = buildInterfaceBlock(toPascalCase(interfaceName), columns, extraInterfaces)
    return [rootBlock, ...extraInterfaces].join('\n\n')
  }

  return { schemaFromSamples, schemaToTsInterface }
}
