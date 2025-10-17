import { TypeChecker } from "./JAL/checker.ts";
import { Parser } from "./JAL/parser.ts";
import { Tokenizer } from "./JAL/tokenizer.ts";
import { Interpreter } from "./JAL/interpreter.ts";
import { DebuggerInterpreter } from "./JAL/debugger.ts";

function main(_args: string[]) {
  try {
    // Check for --debug flag
    const debugMode = _args.includes("--debug");

    const source = _args.find((arg) => arg.endsWith(".jal")) as string;
    if (!source) {
      console.error("No .jal file provided in arguments.");
      console.error("Usage: deno run main.ts [--debug] <file.jal>");
      Deno.exit(1);
    }

    const path = "./" + source;

    // ✅ Check if file exists
    try {
      Deno.statSync(path);
    } catch {
      console.error(`File doesn't exist at ${path}`);
      Deno.exit(1);
    }

    const file = Deno.readFileSync(path);
    const data = new TextDecoder().decode(file);

    const _T = new Tokenizer(data);
    const _P = new Parser(_T.tokenize());
    const _C = new TypeChecker();

    const tokens = _T.tokens;
    const ast = _P.parseProgram();
    const checker = _C.check(ast);

    Deno.writeTextFileSync("./outputs/AST.json", JSON.stringify(ast, null, 2));
    Deno.writeTextFileSync("./outputs/token.json", JSON.stringify(tokens, null, 2));
    Deno.writeTextFileSync("./outputs/walker.json", JSON.stringify(checker, null, 2));

    if (checker.errors.length > 0) {
      console.log("\n=== TYPE CHECKING ERRORS ===");
      for (let i = 0; i < checker.errors.length; i++) {
        console.log(checker.errors[i]);
      }
      Deno.exit(1);
    }

    // Choose interpreter based on debug flag
    if (debugMode) {
      console.log("Running in DEBUG mode...\n");
      const _I = new DebuggerInterpreter();
      _I.execute(ast);
      const steps = _I.getExecutionSteps();
      console.log("=== EXECUTION STEPS ===");
      console.log(steps.join("\n"));
    } else {
      const _I = new Interpreter();
      _I.execute(ast);
    }
  } catch (error: unknown) {
    console.error("FATAL ERROR:", error);
    Deno.exit(1);
  }
}

main(Deno.args);