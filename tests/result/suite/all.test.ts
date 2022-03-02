import { expect } from "chai";
import { Result, Ok, Err } from "../../../src";

export default function all() {
   function ok<T>(ok: T): Result<T, boolean> {
      return Ok(ok);
   }

   function err<E>(err: E): Result<boolean, E> {
      return Err(err);
   }

   it("Should return an Ok tuple when all results are Ok", () =>
      expect(
         Result.all(
            ok(1),
            ok("test_string"),
            ok(true),
            ok({ a: 1, b: 2 })
         ).unwrap()
      ).to.eql([1, "test_string", true, { a: 1, b: 2 }]));

   it("Should return the first Err if any Err is present", () =>
      expect(
         Result.all(
            ok(1),
            ok("two"),
            err("test_err"),
            ok({ a: 1, b: 2 }),
            err("test_err_2")
         ).unwrapErr()
      ).to.equal("test_err"));
}
