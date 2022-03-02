import { Option as BaseOption, isOption, Some, None } from "./monad/option";
export { Some, None } from "./monad/option";

export type Option<T> = BaseOption<T>;

export interface OptionGuard {
   <U>(opt: Option<U>): U;
   bubble(opt: unknown): void;
}

type OptionTypes<O> = {
   [K in keyof O]: O[K] extends Option<infer T> ? T : never;
};

/**
 * An Option represents either something, or nothing. If we hold a value
 * of type `Option<T>`, we know it is either `Some<T>` or `None`.
 *
 * ```
 * const users = ["Simon", "Garfunkel"];
 * function fetch_user(username: string): Option<string> {
 *    return users.includes(username) ? Some(username) : None;
 * }
 *
 * function greet(username: string): string {
 *    return fetch_user(username)
 *       .map((user) => `Hello ${user}, my old friend!`)
 *       .unwrapOr("*silence*");
 * }
 *
 * assert.equal(greet("Simon"), "Hello Simon, my old friend!")
 * assert.equal(greet("SuperKing77"), "*silence*");
 * ```
 *
 * ### Guarded Function Helper
 *
 * Calling `Option(fn)` creates a new function with an `OptionGuard` helper.
 * The guard lets you quickly and safely unwrap other `Option` values, and
 * causes the function to return early with `None` if an unwrap fails. A
 * function created in this way always returns an `Option<T>`.
 *
 * Note: If you intend to use `try`/`catch` inside this function, see
 * tests/examples/guard-bubbling.ts for some possible pit-falls.
 *
 * ```
 * function to_pos(pos: number): Option<number> {
 *    return pos > 0 && pos < 100 ? Some(pos * 10) : None;
 * }
 *
 * // (x: number, y: number) => Option<{ x: number; y: number }>;
 * const get_pos = Option((guard, x: number, y: number) => {
 *    return Some({
 *       x: guard(to_pos(x)),
 *       y: guard(to_pos(y)),
 *    });
 * });
 *
 * function show_pos(x: number, y: number): string {
 *    return get_pos(x, y).mapOr(
 *       "Invalid Pos",
 *       ({ x, y }) => `Pos (${x},${y})`
 *    );
 * }
 *
 * assert.equal(show_pos(10, 20), "Pos (100,200)");
 * assert.equal(show_pos(1, 99), "Pos (10,990)");
 * assert.equal(show_pos(0, 50), "Invalid Pos");
 * assert.equal(show_pos(50, 100), "Invalid Pos");
 * ```
 */
export function Option<T, A extends any[]>(
   fn: (guard: OptionGuard, ...args: A) => Option<T>
): (...args: A) => Option<T> {
   return (...args) => {
      try {
         return fn(guard, ...args);
      } catch (err) {
         if (err === OptionExit) {
            return None;
         } else {
            throw err;
         }
      }
   };
}

Option.is = isOption;
Option.safe = safe;
Option.all = all;
Option.any = any;

function safe<T, A extends any[]>(
   fn: (...args: A) => T,
   ...args: A
): Option<T> {
   try {
      return Some(fn(...args));
   } catch {
      return None;
   }
}

function all<O extends Option<any>[]>(...options: O): Option<OptionTypes<O>> {
   const some = [];
   for (const option of options) {
      if (option.isSome()) {
         some.push(option.unwrapUnchecked());
      } else {
         return None;
      }
   }

   return Some(some) as Some<OptionTypes<O>>;
}

function any<O extends Option<any>[]>(
   ...options: O
): Option<OptionTypes<O>[number]> {
   for (const option of options) {
      if (option.isSome()) {
         return option;
      }
   }
   return None;
}

function guard<U>(opt: Option<U>): U {
   if (opt.isSome()) {
      return opt.unwrap();
   } else {
      throw OptionExit;
   }
}

guard.bubble = (err: unknown) => {
   if (err === OptionExit) {
      throw err;
   }
};

class GuardedOptionExit {}

Object.freeze(GuardedOptionExit.prototype);
Object.freeze(Option);
Object.freeze(guard);
Object.freeze(safe);
Object.freeze(all);
Object.freeze(any);

const OptionExit = Object.freeze(new GuardedOptionExit());
