import type { JsonSchemaDefinition } from '@sfxcode/nuxt-mongocamp-server/dist/runtime/api/models/JsonSchemaDefinition'

export function useJsonSchema() {
  function schemaToColumnDefinition(definition: JsonSchemaDefinition, fields: string[]): any[] {
    const result: any[] = []
    const properties = definition.properties
    const sortedFields: string[] = []
    if (fields.includes('_id')) { sortedFields.push('_id') }
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
      if (properties[key].format && properties[key].format === 'date-time') {
        possibleType = 'date-time'
      }
      else if (properties[key].type) {
        possibleType = properties[key].type
      }
      else if (properties[key].oneOf) {
        const possibleTypesArray: [any] = properties[key].oneOf
        const possibleTypes = possibleTypesArray.map((entry) => {
          return entry.type
        })
        const possibleFormats = possibleTypesArray.map((entry) => {
          return entry.format
        })
        if (possibleFormats.includes('date-time')) {
          possibleType = 'date-time'
        }
        else if (possibleTypes.includes('number')) {
          possibleType = 'number'
        }
      }
      result.push({ columnName: key, columnKey: key, columnType: possibleType })
    })
    return result
  }

  return { schemaToColumnDefinition }
}
