import type { EditorProject } from './types'

const DB_NAME = 'frameforge-local'
const STORE_NAME = 'projects'

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local project storage.'))
  })

const withStore = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Project storage request failed.'))
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error ?? new Error('Project storage transaction failed.'))
  })
}

export const saveProject = (project: EditorProject) =>
  withStore('readwrite', (store) => store.put({ ...project, updatedAt: Date.now() }))

export const loadProjects = () => withStore<EditorProject[]>('readonly', (store) => store.getAll())

export const deleteProject = (id: string) => withStore('readwrite', (store) => store.delete(id))
