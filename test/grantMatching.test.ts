import { describe, it, expect } from 'vitest'
import { permissionFromGrants } from '../src/runtime/utils/grantMatching'

const grant = (name: string, read: boolean, write: boolean, administrate = false, grantType: string | undefined = 'COLLECTION') => ({ name, read, write, administrate, grantType })

describe('permissionFromGrants', () => {
  const grants = [grant('customers', true, false), grant('orders', true, true, true)]

  it('answers from the flags of the grant with that name', () => {
    expect(permissionFromGrants(grants, 'customers', 'read')).toBe(true)
    expect(permissionFromGrants(grants, 'customers', 'write')).toBe(false)
    expect(permissionFromGrants(grants, 'customers', 'administrate')).toBe(false)
    expect(permissionFromGrants(grants, 'orders', 'write')).toBe(true)
    expect(permissionFromGrants(grants, 'orders', 'administrate')).toBe(true)
  })

  it('says no for a collection without a grant — and for every permission', () => {
    expect(permissionFromGrants(grants, 'invoices', 'read')).toBe(false)
    expect(permissionFromGrants(grants, 'invoices', 'write')).toBe(false)
    expect(permissionFromGrants([], 'customers', 'read')).toBe(false)
  })

  it('matches the name exactly: no wildcards, no prefixes (verified on the server)', () => {
    expect(permissionFromGrants([grant('cust*', true, true)], 'customers', 'read')).toBe(false)
    expect(permissionFromGrants([grant('customers', true, true)], 'customers_archive', 'read')).toBe(false)
    expect(permissionFromGrants([grant('customers_archive', true, true)], 'customers', 'read')).toBe(false)
    expect(permissionFromGrants([grant('*', true, true)], 'customers', 'read')).toBe(false)
  })

  it('ignores case, like the server does, and whitespace around the name', () => {
    expect(permissionFromGrants([grant('Customers', true, true)], 'customers', 'write')).toBe(true)
    expect(permissionFromGrants([grant('customers', true, true)], 'CUSTOMERS', 'write')).toBe(true)
    expect(permissionFromGrants([grant(' customers ', true, true)], 'customers', 'read')).toBe(true)
  })

  it('does not let one flag imply another', () => {
    expect(permissionFromGrants([grant('c', false, true)], 'c', 'read')).toBe(false)
    expect(permissionFromGrants([grant('c', true, false, true)], 'c', 'write')).toBe(false)
  })

  it('adds up several grants for the same name: any one that allows it is enough', () => {
    const several = [grant('c', true, false), grant('C', false, true)]

    expect(permissionFromGrants(several, 'c', 'read')).toBe(true)
    expect(permissionFromGrants(several, 'c', 'write')).toBe(true)
    expect(permissionFromGrants(several, 'c', 'administrate')).toBe(false)
  })

  it('only counts collection grants; one without a type is read as a collection grant', () => {
    expect(permissionFromGrants([grant('c', true, true, false, 'BUCKET')], 'c', 'read')).toBe(false)
    expect(permissionFromGrants([grant('c', true, true, false, undefined)], 'c', 'read')).toBe(true)
    expect(permissionFromGrants([grant('c', true, true, false, 'collection')], 'c', 'read')).toBe(true)
  })

  it('cannot decide without a grant list, nor for a GridFS bucket member (grant name/type unverified)', () => {
    expect(permissionFromGrants(undefined, 'c', 'read')).toBeUndefined()
    expect(permissionFromGrants(null, 'c', 'read')).toBeUndefined()
    expect(permissionFromGrants('grants', 'c', 'read')).toBeUndefined()
    expect(permissionFromGrants(grants, 'images.files', 'write')).toBeUndefined()
    expect(permissionFromGrants(grants, 'images.chunks', 'read')).toBeUndefined()
  })

  it('survives malformed entries and requires a real boolean true', () => {
    expect(permissionFromGrants([null, 'x', 5, {}, { name: 'c', read: 'true' }, { name: 5, read: true }], 'c', 'read')).toBe(false)
    expect(permissionFromGrants([null, { name: 'c', read: true }], 'c', 'read')).toBe(true)
  })
})
