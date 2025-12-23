/**
 * A generic Result type for handling success and failure without throwing exceptions.
 */
export class Result<T, E = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  public static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  public static fail<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  public isOk(): boolean {
    return this._isSuccess;
  }

  public isFail(): boolean {
    return !this._isSuccess;
  }

  public unwrap(): T {
    if (this.isFail()) {
      throw this._error instanceof Error ? this._error : new Error(String(this._error));
    }
    return this._value as T;
  }

  public error(): E | undefined {
    return this._error;
  }

  public map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isFail()) {
      return Result.fail<U, E>(this._error as E);
    }
    return Result.ok<U, E>(fn(this._value as T));
  }
}
