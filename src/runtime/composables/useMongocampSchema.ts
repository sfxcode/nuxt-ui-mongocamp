import type { JsonSchemaDefinition } from '@sfxcode/nuxt-mongocamp-server'

interface PropSchema {
  type?: string
  format?: string
  oneOf?: Array<{ type?: string, format?: string }>
}

export interface ColumnDefinition {
  columnName: string
  columnKey: string
  columnType: string
}

export function useMongocampSchema() {
  function schemaToColumnDefinition(definition: JsonSchemaDefinition, fields: string[]): ColumnDefinition[] {
    const result: ColumnDefinition[] = []
    const properties = definition.properties
    const sortedFields: string[] = []
    if (fields.includes('_id')) {
      sortedFields.push('_id')
    }
    const idFields = fields.filter((f) => {
      return f !== '_id' && f.toLowerCase().includes('id')
    }).sort()
    sortedFields.push(...idFields)
    const otherFields = fields.filter((f) => {
      return f !== '_id' && !f.toLowerCase().includes('id')
    }).sort()
    sortedFields.push(...otherFields)

    sortedFields.forEach((key) => {
      let possibleType: string = 'string'
      const prop = properties[key] as PropSchema | undefined
      if (!prop) {
        result.push({ columnName: key, columnKey: key, columnType: possibleType })
        return
      }
      if (prop.format === 'date-time') {
        possibleType = 'date-time'
      }
      else if (prop.type) {
        possibleType = prop.type
      }
      else if (prop.oneOf) {
        const types = prop.oneOf.map(e => e.type)
        const formats = prop.oneOf.map(e => e.format)
        if (formats.includes('date-time')) {
          possibleType = 'date-time'
        }
        else if (types.includes('number')) {
          possibleType = 'number'
        }
      }
      result.push({ columnName: key, columnKey: key, columnType: possibleType })
    })
    return result
  }

  return { schemaToColumnDefinition }
}
