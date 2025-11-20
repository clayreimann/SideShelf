/**
 * Type declarations for async-lock module
 */

declare module "async-lock" {
  class AsyncLock {
    constructor(options?: AsyncLock.Options);

    acquire<T>(
      key: string | string[],
      fn: () => Promise<T> | T,
      opts?: AsyncLock.AcquireOptions
    ): Promise<T>;

    isBusy(key?: string): boolean;
  }

  namespace AsyncLock {
    interface Options {
      timeout?: number;
      maxPending?: number;
      domainReentrant?: boolean;
      Promise?: any;
    }

    interface AcquireOptions {
      timeout?: number;
      domainReentrant?: boolean;
    }
  }

  export = AsyncLock;
}
