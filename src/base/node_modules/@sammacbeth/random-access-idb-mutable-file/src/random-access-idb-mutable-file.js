// @flow strict

import RandomAccess from "random-access-storage"
import type {
  Stat,
  Request,
  OpenRequest,
  ReadRequest,
  WriteRequest,
  DeleteRequest,
  StatRequest,
  CloseRequest,
  DestroyRequest
} from "random-access-storage"
import { indexedDB } from "./IndexedDB"
import type {
  IDBRequest,
  IDBDatabase,
  IDBObjectStore,
  IDBMutableFile,
  IDBFileHandle
} from "./IndexedDB"
import { Buffer } from "buffer"

const promise = /*::<x, a>*/ (request /*:IDBRequest<x, a>*/) /*:Promise<a>*/ =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

class RandomAccessIDBFileVolume {
  db: IDBDatabase
  name: string
  version: number
  storeName: string
  options: VolumeOptions
  constructor(
    db: IDBDatabase,
    name: string,
    version: number,
    storeName: string,
    options: VolumeOptions
  ) {
    this.db = db
    this.name = name
    this.version = version
    this.storeName = storeName
    this.options = options
  }
  store(): IDBObjectStore<string, IDBMutableFile> {
    const { db, storeName } = this
    const transaction = db.transaction([storeName], "readwrite")
    return transaction.objectStore(storeName)
  }
  async delete(url) {
    return await promise(this.store().delete(url))
  }
  async save(url, file) {
    return await promise(this.store().put(file, url))
  }
  async open(url, mode) {
    const file = await promise(this.store().get(url))
    if (file) {
      return file
    } else if (mode === "readwrite") {
      const file = await promise(
        this.db.createMutableFile(url, "binary/random")
      )
      await this.save(url, file)
      return file
    } else {
      throw new RangeError(`File ${url} does not exist`)
    }
  }

  mount(file: string, options?: FileOptions) {
    return new RandomAccessProvider(this, `/${file}`, options)
  }
}

interface VolumeOptions {
  debug?: boolean;
  name?: string;
  version?: number;
  storeName?: string;
}

interface FileOptions {
  truncate?: boolean;
  size?: number;
  readable?: boolean;
  writable?: boolean;
}

interface Size {
  size: number;
}

class RandomAccessProvider extends RandomAccess {
  url: string
  volume: RandomAccessIDBFileVolume
  debug: boolean
  file: ?IDBMutableFile
  lockedFile: ?IDBFileHandle
  mode: "readonly" | "readwrite"
  workQueue: Request[]
  isIdle: boolean
  options: FileOptions

  static async mount(options?: VolumeOptions = {}) {
    if (!self.IDBMutableFile) {
      throw Error(
        `Runtime does not supports IDBMutableFile https://developer.mozilla.org/en-US/docs/Web/API/IDBMutableFile`
      )
    } else {
      const name = options.name || `RandomAccess`
      const version = options.version || 1.0
      const storeName = options.storeName || `IDBMutableFile`

      const request = indexedDB.open(name, version)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }
      const db = await promise(request)
      const volume = new RandomAccessIDBFileVolume(
        db,
        name,
        version,
        storeName,
        options
      )
      return (path: string, options?: FileOptions) =>
        volume.mount(path, options)
    }
  }
  static async open(
    self: RandomAccessProvider,
    request: OpenRequest
  ): Promise<void> {
    const { options } = self
    const mode = request.preferReadonly ? "readonly" : "readwrite"
    self.debug && console.log(`>> open ${self.url} ${mode}`)

    if (!self.file || (self.mode !== mode && mode === "readwrite")) {
      self.mode = mode
      self.file = await self.volume.open(self.url, mode)
    }

    if (!(mode === "readonly" || !options.truncate)) {
      const file = self.activate()
      await promise(file.truncate(options.size || 0))
    }

    self.debug && console.log(`<< open ${self.url} ${mode}`)
  }
  static async read(
    self: RandomAccessProvider,
    { data, offset, size }: ReadRequest
  ): Promise<Buffer> {
    self.debug && console.log(`>> read ${self.url} <${offset}, ${size}>`)
    const buffer: Buffer = data || Buffer.allocUnsafe(size)
    if (size === 0) {
      return buffer
    }

    const file = self.activate()
    file.location = offset
    const chunk = await promise(file.readAsArrayBuffer(size))
    if (chunk.byteLength !== size) {
      throw new Error("Could not satisfy length")
    }

    Buffer.from(chunk).copy(buffer)
    self.debug &&
      console.log(`<< read ${self.url} <${offset}, ${size}>`, buffer)
    return buffer
  }
  static async write(
    self: RandomAccessProvider,
    { data, offset, size }: WriteRequest
  ): Promise<void> {
    self.debug && console.log(`>> write ${self.url} <${offset}, ${size}>`, data)
    const { byteLength, byteOffset } = data
    const chunk = byteLength === size ? data : data.slice(0, size)

    const file = self.activate()
    file.location = offset
    const wrote = await promise(file.write(chunk))

    self.debug && console.log(`<< write ${self.url} <${offset}, ${size}>`)

    return wrote
  }
  static async delete(
    self: RandomAccessProvider,
    { offset, size }: DeleteRequest
  ): Promise<void> {
    self.debug && console.log(`>> delete ${self.url} <${offset}, ${size}>`)
    const stat = await this.stat(self)
    if (offset + size >= stat.size) {
      const file = self.activate()
      await promise(file.truncate(offset))
    }

    self.debug && console.log(`<< delete ${self.url} <${offset}, ${size}>`)
  }
  static async stat(self: RandomAccessProvider): Promise<Stat> {
    self.debug && console.log(`>> stat ${self.url}`)
    const file = self.activate()
    const stat = await promise(file.getMetadata())
    self.debug && console.log(`<< stat {size:${stat.size}} ${self.url} `)

    return stat
  }
  static async close(self: RandomAccessProvider): Promise<void> {
    self.debug && console.log(`>> close ${self.url}`)
    const { lockedFile } = self
    if (lockedFile && lockedFile.active) {
      await promise(lockedFile.flush())
    }
    self.lockedFile = null
    self.file = null
    self.debug && console.log(`<< close ${self.url}`)
  }
  static async destroy(self: RandomAccessProvider): Promise<void> {
    self.debug && console.log(`>> destroy ${self.url}`)
    await self.volume.delete(self.url)
    self.debug && console.log(`<< destroy ${self.url}`)
  }

  static async awake(self: RandomAccessProvider) {
    const { workQueue } = self
    self.isIdle = false
    let index = 0
    while (index < workQueue.length) {
      const request = workQueue[index++]
      await this.perform(self, request)
    }
    workQueue.length = 0
    self.isIdle = true
  }
  static schedule(self: RandomAccessProvider, request: Request) {
    self.workQueue.push(request)
    if (self.isIdle) {
      this.awake(self)
    }
  }
  static async perform(self: RandomAccessProvider, request: Request) {
    try {
      switch (request.type) {
        case RequestType.open: {
          return request.callback(null, await this.open(self, request))
        }
        case RequestType.read: {
          return request.callback(null, await this.read(self, request))
        }
        case RequestType.write: {
          return request.callback(null, await this.write(self, request))
        }
        case RequestType.delete: {
          return request.callback(null, await this.delete(self, request))
        }
        case RequestType.stat: {
          return request.callback(null, await this.stat(self))
        }
        case RequestType.close: {
          return request.callback(null, await this.close(self))
        }
        case RequestType.destroy: {
          return request.callback(null, await this.destroy(self))
        }
      }
    } catch (error) {
      request.callback(error)
    }
  }
  _open(request: OpenRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  _openReadonly(request: OpenRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  _write(request: WriteRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  _read(request: ReadRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  _del(request: DeleteRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  _stat(request: StatRequest) {
    RandomAccessProvider.perform(this, request)
  }
  _close(request: CloseRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  _destroy(request: DestroyRequest) {
    RandomAccessProvider.schedule(this, request)
  }
  constructor(
    volume: RandomAccessIDBFileVolume,
    url: string,
    options?: FileOptions = {}
  ) {
    super()
    this.volume = volume
    this.url = url
    this.options = options
    this.mode = "readonly"
    this.file = null
    this.lockedFile = null

    this.workQueue = []
    this.isIdle = true
    this.debug = !!volume.options.debug
  }
  activate(): IDBFileHandle {
    const { lockedFile, file, mode } = this
    if (lockedFile && lockedFile.active) {
      return lockedFile
    } else if (file) {
      const lockedFile = file.open(mode)
      this.lockedFile = lockedFile
      return lockedFile
    } else {
      throw new RangeError(
        `Unable to activate file, likely provider was destroyed`
      )
    }
  }
}

const RequestType = {
  open: 0,
  read: 1,
  write: 2,
  delete: 3,
  stat: 4,
  close: 5,
  destroy: 6
}

export default RandomAccessProvider
