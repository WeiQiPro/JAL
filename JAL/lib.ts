import { Expression, RuntimeValue } from "./types.ts";

interface InterpreterInterface {
  evaluateExpressionPublic(expr: Expression): RuntimeValue;
}

export class Library {
  private interpreter: InterpreterInterface;
  private functions: Map<string, (args: Expression[]) => RuntimeValue>;

  constructor(interpreter: InterpreterInterface) {
    this.interpreter = interpreter;
    this.functions = new Map([
      ["print", this.print.bind(this)],
      ["len", this.len.bind(this)],
      ["type", this.type.bind(this)],
      ["toString", this.toString.bind(this)],
      ["toNumber", this.toNumber.bind(this)],
    ]);
  }

  // Check if a function name is a built-in
  isBuiltIn(name: string): boolean {
    return this.functions.has(name);
  }

  // Execute a built-in function
  call(name: string, args: Expression[]): RuntimeValue {
    const fn = this.functions.get(name);
    if (!fn) {
      throw new Error(`Unknown built-in function: ${name}`);
    }
    return fn(args);
  }

  // Print to console
  private print(args: Expression[]): RuntimeValue {
    const values = args.map((arg) => this.interpreter.evaluateExpressionPublic(arg));
    const output = values.map((v) => this.formatValue(v)).join(" ");
    console.log(output);
    return null;
  }

  // Get length of array or string
  private len(args: Expression[]): RuntimeValue {
    if (args.length !== 1) {
      throw new Error("len() expects 1 argument");
    }
    const value = this.interpreter.evaluateExpressionPublic(args[0]);
    
    if (typeof value === "string") return value.length;
    if (Array.isArray(value)) return value.length;
    
    throw new Error(`len() requires string or array, got ${typeof value}`);
  }

  // Get type of value
  private type(args: Expression[]): RuntimeValue {
    if (args.length !== 1) {
      throw new Error("type() expects 1 argument");
    }
    const value = this.interpreter.evaluateExpressionPublic(args[0]);
    
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  // Convert to string
  private toString(args: Expression[]): RuntimeValue {
    if (args.length !== 1) {
      throw new Error("toString() expects 1 argument");
    }
    const value = this.interpreter.evaluateExpressionPublic(args[0]);
    return this.formatValue(value);
  }

  // Convert to number
  private toNumber(args: Expression[]): RuntimeValue {
    if (args.length !== 1) {
      throw new Error("toNumber() expects 1 argument");
    }
    const value = this.interpreter.evaluateExpressionPublic(args[0]);
    
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const num = parseFloat(value);
      if (isNaN(num)) throw new Error(`Cannot convert "${value}" to number`);
      return num;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    
    throw new Error(`Cannot convert ${typeof value} to number`);
  }

  private formatValue(value: RuntimeValue): string {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.formatValue(v)).join(", ")}]`;
    }
    if (typeof value === "string") return value;
    return String(value);
  }
}