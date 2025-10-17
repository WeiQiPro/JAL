import { TypeChecker } from "./JAL/checker.ts";
import { Parser } from "./JAL/parser.ts";
import { Tokenizer } from "./JAL/tokenizer.ts";
import { Interpreter } from "./JAL/interpreter.ts";

function main(_args: string[]) {
  try {
    const debugMode = _args.includes("--debug") || _args.includes("-d");
    const output = _args.includes("-o") || _args.includes("--output");

    const source = _args.find((arg) => arg.endsWith(".jal")) as string;
    if (!source) {
      console.error("No .jal file provided in arguments.");
      console.error("Usage: deno run main.ts [--debug] <file.jal>");
      Deno.exit(1);
    }
    let path;
    if (source.startsWith("./")) {
      path = source;
    } else {
      path = "./" + source;
    }

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
    if (debugMode) {
      Deno.writeTextFileSync(
        "./outputs/token.json",
        JSON.stringify(tokens, null, 2),
      );
    }
    const ast = _P.parseProgram();
    if (debugMode) {
      Deno.writeTextFileSync(
        "./outputs/AST.json",
        JSON.stringify(ast, null, 2),
      );
    }
    const checker = _C.check(ast);
    if (debugMode) {
      Deno.writeTextFileSync(
        "./outputs/walker.json",
        JSON.stringify(checker, null, 2),
      );
    }

    if (checker.errors.length > 0) {
      console.log("\n=== TYPE CHECKING ERRORS ===");
      for (let i = 0; i < checker.errors.length; i++) {
        console.log(checker.errors[i]);
      }

      if (ast) {
        Deno.writeTextFileSync(
          "./outputs/AST.json",
          JSON.stringify(ast, null, 2),
        );
      }
      if (tokens) {
        Deno.writeTextFileSync(
          "./outputs/token.json",
          JSON.stringify(tokens, null, 2),
        );
      }

      if (checker) {
        Deno.writeTextFileSync(
          "./outputs/walker.json",
          JSON.stringify(checker, null, 2),
        );
      }

      Deno.exit(1);
    }

    if (debugMode) {
      console.log("Running in DEBUG mode...\n");
      const _I = new Interpreter();
      _I.execute(ast);
      const steps = _I.getExecutionSteps();
      if (output) console.log(steps.join("\n"));

      Deno.writeTextFileSync("./outputs/EXE.json", JSON.stringify(steps));

      Deno.writeTextFileSync(
        "./outputs/AST.json",
        JSON.stringify(ast, null, 2),
      );
      Deno.writeTextFileSync(
        "./outputs/token.json",
        JSON.stringify(tokens, null, 2),
      );
      Deno.writeTextFileSync(
        "./outputs/walker.json",
        JSON.stringify(checker, null, 2),
      );
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
