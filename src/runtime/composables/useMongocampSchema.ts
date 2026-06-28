import type { JsonSchemaDefinition } from '@sfxcode/nuxt-mongocamp-server'

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
      const prop = properties[key] as any
      if (!prop) {
        result.push({ columnName: key, columnKey: key, columnType: possibleType })
        return
      }
      if (prop.format && prop.format === 'date-time') {
        possibleType = 'date-time'
      }
      else if (prop.type) {
        possibleType = prop.type
      }
      else if (prop.oneOf) {
        const possibleTypesArray: any[] = prop.oneOf
        const possibleTypes = possibleTypesArray.map((entry: any) => entry.type)
        const possibleFormats = possibleTypesArray.map((entry: any) => entry.format)
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
