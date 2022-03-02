import { Result as BaseResult, isResult, Ok, Err } from "./monad/result";
export { Ok, Err } from "./monad/result";

export type Result<T, E> = BaseResult<T, E>;

export interface ResultGuard<E> {
   <U>(res: Result<U, E>): U;
   bubble(err: unknown): void;
}

type ResultTypes<R> = {
   [K in keyof R]: R[K] extends Result<infer T, any> ? T : never;
};

type ResultErrors<R> = {
   [K in keyof R]: R[K] extends Result<any, infer U> ? U : never;
};

/**
 * A Result represents success, or failure. If we hold a value
 * of type `Result<T, E>`, we know it is either `Ok<T, E>` or `Err<E, T>`.
 *
 * ```
 * const users = ["Simon", "Garfunkel"];
 * function fetch_user(username: string): Result<string, string> {
 *    return users.includes(username)
 *       ? Ok(username)
 *       : Err("*silence*");
 * }
 *
 * function greet(username: string): string {
 *    return fetch_user(username).mapOrElse(
 *       (err) => `Error: ${err}`,
 *       (user) => `Hello ${user}, my old friend!`
 *    );
 * }
 *
 * assert.equal(greet("Simon"), "Hello Simon, my old friend!")
 * assert.equal(greet("SuperKing77"), "Error: *silence*");
 * ```
 *
 * ### Guarded Function Helper
 *
 * Calling `Result(fn)` creates a new function with a `ResultGuard<E>` helper.
 * The guard lets you quickly and safely unwrap other `Result` values
 * (providing that they have the same `E` type), and causes the function to
 * return early with `Err<E>` if an unwrap fails. A function create in this way
 * always returns a `Result<T, E>`.
 *
 * Note: If you intend to use `try`/`catch` inside this function, see
 * tests/examples/guard-bubbling.ts for some possible pit-falls.
 *
 * ```
 * function to_pos(pos: number): Result<number, string> {
 *    return pos > 0 && pos < 100
 *       ? Ok(pos * 10)
 *       : Err("Invalid Pos");
 * }
 *
 * // (x: number, y: number) => Result<{ x: number; y: number }, string>;
 * const get_pos = Result((guard: Guard<string>, x: number, y: number) => {
 *    return Ok({
 *       x: guard(to_pos(x)),
 *       y: guard(to_pos(y)),
 *    });
 * });
 *
 * function show_pos(x: number, y: number): string {
 *    return get_pos(x, y).mapOrElse(
 *       (err) => `Error: ${err}`,
 *       ({ x, y }) => `Pos (${x},${y})`
 *    );
 * }
 *
 * assert.equal(show_pos(10, 20), "Pos (100,200)");
 * assert.equal(show_pos(1, 99), "Pos (10,990)");
 * assert.equal(show_pos(0, 50), "Error: Invalid Pos");
 * assert.equal(show_pos(50, 100), "Error: Invalid Pos");
 * ```
 */
export function Result<T, E, A extends any[]>(
   fn: (guard: ResultGuard<E>, ...args: A) => Result<T, E>
): (...args: A) => Result<T, E> {
   return (...args) => {
      try {
         return fn(guard, ...args);
      } catch (err) {
         if (err instanceof GuardedResultExit) {
            return err.result;
         } else {
            throw err;
         }
      }
   };
}

Result.is = isResult;
Result.safe = safe;
Result.all = all;
Result.any = any;

/**
 * Capture the outcome of a function or Promise as a `Result<T, Error>`,
 * preventing throwing (function) or rejection (Promise).
 *
 * **Note:** If the function throws (or the Promise rejects with) a value that
 * is not an instance of `Error`, the value is converted to a string and used
 * as the message text for a new Error instance.
 *
 * ### Usage for functions
 *
 * Calls `fn` with the provided `args` and returns a `Result<T, Error>`. The
 * Result is `Ok` if the provided function returned, or `Err` if it threw.
 *
 * **Note:** Any function which returns a Promise (or PromiseLike) value is
 * rejected by the type signature. `Result<Promise<T>, Error>` is not a useful
 * type, and using it in this way is likely to be a mistake.
 *
 * ```
 * function mightThrow(throws: boolean) {
 *    if (throws) {
 *       throw new Error("Throw");
 *    }
 *    return "Hello World";
 * }
 *
 * const x: Result<string, Error> = Result.safe(mightThrow, true);
 * assert.equal(x.unwrapErr() instanceof Error, true);
 * assert.equal(x.unwrapErr().message, "Throw");
 *
 * const x = Result.safe(() => mightThrow(false));
 * assert.equal(x.unwrap(), "Hello World");
 * ```
 *
 * ### Usage for Promises
 *
 * Accepts `promise` and returns a new Promise which always resolves to
 * `Result<T, Error>`. The Result is `Ok` if the original promise
 * resolved, or `Err` if it rejected.
 *
 * ```
 * async function mightThrow(throws: boolean) {
 *    if (throws) {
 *       throw new Error("Throw")
 *    }
 *    return "Hello World";
 * }
 *
 * const x = await Result.safe(mightThrow(true));
 * assert.equal(x.unwrapErr() instanceof Error, true);
 * assert.equal(x.unwrapErr().message, "Throw");
 *
 * const x = await Result.safe(mightThrow(false));
 * assert.equal(x.unwrap(), "Hello World");
 * ```
 */

function safe<T, A extends any[]>(
   fn: (...args: A) => T extends PromiseLike<any> ? never : T,
   ...args: A
): Result<T, Error>;
function safe<T>(promise: Promise<T>): Promise<Result<T, Error>>;
function safe<T, A extends any[]>(
   fn: ((...args: A) => T) | Promise<T>,
   ...args: A
): Result<T, Error> | Promise<Result<T, Error>> {
   if (fn instanceof Promise) {
      return fn.then(
         (value) => Ok(value),
         (err) =>
            err instanceof Error ? Err(err) : Err(new Error(String(err)))
      );
   }

   try {
      return Ok(fn(...args));
   } catch (err) {
      return err instanceof Error ? Err(err) : Err(new Error(String(err)));
   }
}

/**
 * Converts a number of `Result`s into a single Result. The first `Err` found
 * (if any) is returned, otherwise the new Result is `Ok` and contains an array
 * of all the unwrapped values.
 *
 * ```
 * function num(val: number): Result<number, string> {
 *    return val > 10 ? Ok(val) : Err(`Value ${val} is too low.`);
 * }
 *
 * const xyz = Result.all(num(20), num(30), num(40));
 * const [x, y, z] = xyz.unwrap();
 * assert.equal(x, 20);
 * assert.equal(y, 30);
 * assert.equal(z, 40);
 *
 * const err = Result.all(num(20), num(5), num(40));
 * assert.equal(err.isErr(), true);
 * assert.equal(err.unwrapErr(), "Value 5 is too low.");
 * ```
 */
function all<R extends Result<any, any>[]>(
   ...results: R
): Result<ResultTypes<R>, ResultErrors<R>[number]> {
   const ok = [];
   for (const result of results) {
      if (result.isOk()) {
         ok.push(result.unwrapUnchecked());
      } else {
         return result;
      }
   }

   return Ok(ok) as Ok<ResultTypes<R>, any>;
}

/**
 * Converts a number of `Result`s into a single Result. The first `Ok` found
 * (if any) is returned, otherwise the new Result is an `Err` containing an
 * array of all the unwrapped errors.
 *
 * ```
 * function num(val: number): Result<number, string> {
 *    return val > 10 ? Ok(val) : Err(`Value ${val} is too low.`);
 * }
 *
 * const x = Result.any(num(5), num(20), num(2));
 * assert.equal(x.unwrap(), 20);
 *
 * const efg = Result.any(num(2), num(5), num(8));
 * const [e, f, g] = efg.unwrapErr();
 * assert.equal(e, "Value 2 is too low.");
 * assert.equal(f, "Value 5 is too low.");
 * assert.equal(g, "Value 8 is too low.");
 * ```
 */
function any<R extends Result<any, any>[]>(
   ...results: R
): Result<ResultTypes<R>[number], ResultErrors<R>> {
   const err = [];
   for (const result of results) {
      if (result.isOk()) {
         return result;
      } else {
         err.push(result.unwrapUnchecked());
      }
   }

   return Err(err) as Err<ResultErrors<R>, any>;
}

function guard<U, E>(res: Result<U, E>): U {
   if (res.isOk()) {
      return res.unwrapUnchecked() as U;
   } else {
      throw new GuardedResultExit(res);
   }
}

guard.bubble = (err: unknown) => {
   if (err instanceof GuardedResultExit) {
      throw err;
   }
};

class GuardedResultExit<E> {
   result: E;
   constructor(result: E) {
      this.result = result;
      Object.freeze(this);
   }
}

Object.freeze(GuardedResultExit.prototype);
Object.freeze(Result);
Object.freeze(guard);
Object.freeze(safe);
Object.freeze(all);
Object.freeze(any);
