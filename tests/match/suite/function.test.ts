import { expect } from "chai";
import {
   Option,
   Result,
   Some,
   None,
   Ok,
   Err,
   match,
   Fn,
   SomeIs,
   OkIs,
   ErrIs,
   _,
   Default,
} from "../../../src";

export default function fn() {
   let called = false;
   const testFn = () => {
      called = true;
      return "test";
   };

   function functionMatch(input: Option<() => string>): string {
      return match(input, [
         [Some(Fn(testFn)), "test"],
         () => "default", //
      ]);
   }

   it("Matches", () => {
      expect(functionMatch(Some(testFn))).to.equal("test");
      expect(called).to.be.false;
      expect(functionMatch(Some(() => "none"))).to.equal("default");
   });
}
