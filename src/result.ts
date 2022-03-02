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

function safe<T, A extends any[]>(
   fn: (...args: A) => T,
   ...args: A
): Result<T, Error>;
function safe<T>(promise: Promise<T>): Promise<Result<T, Error>>;
function safe<T, A extends any[]>(
   fn: ((...args: A) => T) | Promise<T>,
   ...args: A
): Result<T, Error> | Promise<Result<T, Error>> {
   if (fn instanceof Promise) {
      return fn
         .then((value) => Ok(value))
         .catch((err) =>
            err instanceof Error ? Err(err) : Err(new Error(String(err)))
         ) as Promise<Result<T, Error>>;
   }

   try {
      return Ok(fn(...args));
   } catch (err) {
      return err instanceof Error ? Err(err) : Err(new Error(String(err)));
   }
}

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

function guard<T, E>(res: Result<T, E>): T {
   if (res.isOk()) {
      return res.unwrap();
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
