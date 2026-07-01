export function useTestData() {
  const { collectionApi, documentApi, indexApi, fileApi, bucketApi } = useMongocampApi()

  const TEST_COLLECTIONS = [
    'test_customer',
    'test_order',
    'test_order_product',
    'test_address',
    'test_product',
    'test_cart',
  ]

  const TEST_BUCKETS = [
    'test_images',
  ]

  const TEST_IMAGES = [
    { fileName: 'red-square.png', contentType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAVklEQVR4nGO8Y2PDQEvARFPTGYaDBSzIHOXDh6li6F1b2wHyAab9pALMMBj6kcw0agEhMGoBQTBqAUEwagFBMGrBCLCABVOIWm0LOvmAcbRtSgjQ3AIAtv8Kljncd/gAAAAASUVORK5CYII=' },
    { fileName: 'green-square.png', contentType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAVklEQVR4nGO02RLFQEvARFPTGYaDBSzInMPeS6liqO3W6AHyAab9pALMMBj6kcw0agEhMGoBQTBqAUEwagFBMGrBCLCABVOIWm0LOvmAcbRtSgjQ3AIARG0KjEol2i0AAAAASUVORK5CYII=' },
    { fileName: 'blue-square.png', contentType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAVklEQVR4nGO0SbnDQEvARFPTGYaDBSzInMOzlaliqG3q3QHyAab9pALMMBj6kcw0agEhMGoBQTBqAUEwagFBMGrBCLCABVOIWm0LOvmAcbRtSgjQ3AIAfS0Kvr7PDSsAAAAASUVORK5CYII=' },
    { fileName: 'yellow-square.png', contentType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAWUlEQVR4nGN8dsKGgZaAiaamMwwHC1iQOZLmh6li6POTtgPkA0z7SQWYYTD0I5lp1AJCYNQCgmDUAoJg1AKCYNSCEWABC6YQtdoWA+GD5xS0J4ZvJDPR2gIAVNQLMjeeed0AAAAASUVORK5CYII=' },
    { fileName: 'purple-square.png', contentType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAWUlEQVR4nGPsCTjBQEvARFPTGYaDBSzInOL15lQxtDfw5AD5ANN+UgFmGAz9SGYatYAQGLWAIBi1gCAYtYAgGLVgBFjAgilErbbFQPigl4L2xPCNZCZaWwAAOj0K7CKtKoYAAAAASUVORK5CYII=' },
  ]

  function base64ToBlob(base64: string, contentType: string): Blob {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: contentType })
  }

  async function dropAllTestCollections() {
    await Promise.all([
      ...TEST_COLLECTIONS.map(collectionName =>
        collectionApi.deleteCollection({ collectionName }).catch(() => {}),
      ),
      ...TEST_BUCKETS.map(bucketName =>
        bucketApi.deleteBucket({ bucketName }).catch(() => {}),
      ),
    ])
  }

  async function updateTestData(collectionName: string, name: string) {
    await collectionApi.deleteCollection({ collectionName }).catch(() => {})
    const fileName = `/data/${name}.json`
    const result = await $fetch(fileName, {})
    const json = result as []
    const chunkSize = 100
    for (let i = 0; i < json?.length; i += chunkSize) {
      const chunk = json?.slice(i, i + chunkSize)
      await documentApi.insertMany({ collectionName, requestBody: chunk })
    }
  }

  async function resetCustomer() {
    await updateTestData('test_customer', 'Customer')
    await indexApi.createIndex({ collectionName: 'test_customer', indexCreateRequest: { keys: { id: 1 } } })
    await indexApi.createIndex({ collectionName: 'test_customer', indexCreateRequest: { keys: { lastName: 1 } } })
  }

  async function resetOrder() {
    await updateTestData('test_order', 'Order')
    await indexApi.createIndex({ collectionName: 'test_order', indexCreateRequest: { keys: { id: 1 } } })
    await indexApi.createIndex({ collectionName: 'test_order', indexCreateRequest: { keys: { customerId: 1 } } })
    await indexApi.createIndex({ collectionName: 'test_order', indexCreateRequest: { keys: { addressId: 1 } } })
  }

  async function resetAddress() {
    await updateTestData('test_address', 'Address')
    await indexApi.createIndex({ collectionName: 'test_address', indexCreateRequest: { keys: { id: 1 } } })
  }

  async function resetOrderProduct() {
    await updateTestData('test_order_product', 'OrderProduct')
    await indexApi.createIndex({ collectionName: 'test_order_product', indexCreateRequest: { keys: { id: 1 } } })
    await indexApi.createIndex({ collectionName: 'test_order_product', indexCreateRequest: { keys: { orderId: 1 } } })
    await indexApi.createIndex({ collectionName: 'test_order_product', indexCreateRequest: { keys: { productId: 1 } } })
  }

  async function resetProduct() {
    await updateTestData('test_product', 'Product')
    await indexApi.createIndex({ collectionName: 'test_product', indexCreateRequest: { keys: { id: 1 } } })
  }

  async function resetCart() {
    await updateTestData('test_cart', 'Cart')
    await indexApi.createIndex({ collectionName: 'test_cart', indexCreateRequest: { keys: { id: 1 } } })
    await indexApi.createIndex({ collectionName: 'test_cart', indexCreateRequest: { keys: { customerId: 1 } } })
  }

  async function resetImages() {
    await bucketApi.deleteBucket({ bucketName: 'test_images' }).catch(() => {})
    for (const image of TEST_IMAGES) {
      const file = base64ToBlob(image.base64, image.contentType)
      await fileApi.insertFile({
        bucketName: 'test_images',
        file,
        fileName: image.fileName,
        metaData: JSON.stringify({ contentType: image.contentType }),
      })
    }
  }

  return { dropAllTestCollections, resetAddress, resetCart, resetCustomer, resetImages, resetOrder, resetOrderProduct, resetProduct }
}
