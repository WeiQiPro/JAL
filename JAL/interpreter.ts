import {
  BinaryExpression,
  BlockStatement,
  Environment,
  Expression,
  FunctionCallExpression,
  FunctionDeclaration,
  IfStatement,
  ListPushStatement,
  Literal,
  OperatorTokenType,
  Program,
  ReturnStatement,
  RuntimeValue,
  Statement,
  VariableDeclaration,
} from "./types.ts";
import { Library } from "./lib.ts";

export class Interpreter {
  private globalEnv: Environment;
  private currentEnv: Environment;
  private functions: Map<
    string,
    { params: Array<{ name: string }>; body: BlockStatement }
  > = new Map();
  private returnValue: RuntimeValue | undefined = undefined;
  private shouldReturn = false;
  private steps: string[] = [];
  private depth = 0;
  private lib: Library;

  constructor() {
    this.globalEnv = {
      variables: new Map(),
      parent: null,
    };
    this.currentEnv = this.globalEnv;
    this.lib = new Library(this);
  }

  private addStep(message: string): void {
    const indent = "  ".repeat(this.depth);
    this.steps.push(`${indent}${message}`);
  }

  execute(program: Program): void {
    try {
      this.addStep("=== EXECUTION START ===");
      this.addStep("");

      // First pass: collect function declarations
      this.addStep("PASS 1: Collecting function declarations...");
      for (const stmt of program.body) {
        if (stmt.kind === "FunctionDeclaration") {
          this.addStep(
            `  Found function: ${(stmt as unknown as { name: string }).name}`,
          );
          this.registerFunction(stmt);
        }
      }
      this.addStep(`Total functions registered: ${this.functions.size}`);
      this.addStep("");

      // Second pass: execute statements (skip function declarations and expression statements)
      this.addStep("PASS 2: Executing global statements...");
      this.addStep("");
      for (const stmt of program.body) {
        // Skip function declarations (already registered) and expression statements
        if (
          stmt.kind === "FunctionDeclaration" ||
          stmt.kind === "ExpressionStatement"
        ) {
          continue;
        }
        this.executeStatement(stmt);
        if (this.shouldReturn) break;
      }

      // Third pass: execute main function if it exists
      if (this.functions.has("main")) {
        this.addStep("");
        this.addStep("PASS 3: Executing main()...");
        this.addStep("");
        this.shouldReturn = false;
        this.returnValue = undefined;
        const mainFunc = this.functions.get("main")!;

        this.pushEnvironment();
        this.depth++;
        this.addStep("Enter function scope");

        this.executeBlockStatement(mainFunc.body);

        this.depth--;
        this.popEnvironment();
      }

      this.addStep("");
      this.addStep("=== EXECUTION END ===");
    } catch (error) {
      this.addStep(`ERROR: ${error}`);
      console.error("Runtime error:", error);
      throw error;
    }
  }

  private registerFunction(decl: FunctionDeclaration): void {
    this.functions.set(decl.name, {
      params: decl.params.map((p) => ({ name: p.name })),
      body: decl.body,
    });
  }

  private pushEnvironment(): void {
    this.currentEnv = {
      variables: new Map(),
      parent: this.currentEnv,
    };
  }

  private popEnvironment(): void {
    if (this.currentEnv.parent) {
      this.currentEnv = this.currentEnv.parent;
    }
  }

  private defineVariable(
    name: string,
    value: RuntimeValue,
    mutable: boolean,
  ): void {
    if (this.currentEnv.variables.has(name)) {
      throw new Error(`Variable '${name}' already defined in current scope`);
    }
    this.currentEnv.variables.set(name, { value, mutable });
  }

  private getVariable(name: string): RuntimeValue {
    let env: Environment | null = this.currentEnv;

    while (env) {
      if (env.variables.has(name)) {
        return env.variables.get(name)!.value;
      }
      env = env.parent;
    }

    throw new Error(`Undefined variable: '${name}'`);
  }

  private setVariable(name: string, value: RuntimeValue): void {
    let env: Environment | null = this.currentEnv;

    while (env) {
      if (env.variables.has(name)) {
        const variable = env.variables.get(name)!;
        if (!variable.mutable) {
          throw new Error(`Cannot assign to immutable variable '${name}'`);
        }
        variable.value = value;
        return;
      }
      env = env.parent;
    }

    throw new Error(`Undefined variable: '${name}'`);
  }

  private executeStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        this.executeVariableDeclaration(stmt);
        break;
      case "ExpressionStatement":
        this.addStep(`Executing expression statement`);
        this.depth++;
        this.evaluateExpression(stmt.expression);
        this.depth--;
        break;
      case "BlockStatement":
        this.executeBlockStatement(stmt);
        break;
      case "FunctionDeclaration":
        // Already registered in first pass
        break;
      case "ListPushStatement":
        this.executeListPushStatement(stmt);
        break;
      case "ReturnStatement":
        this.executeReturnStatement(stmt);
        break;
      case "IfStatement":
        this.executeIfStatement(stmt);
        break;
      case "WhileStatement":
        this.executeWhileStatement(stmt);
        break;
      case "ForStatement":
        this.executeForStatement(stmt);
        break;
      case "AssignmentStatement":
        this.executeAssignmentStatement(stmt);
        break;
      default: {
        const unknownStmt = stmt as Record<string, unknown>;
        throw new Error(`Unknown statement kind: ${unknownStmt.kind}`);
      }
    }
  }

  private executeAssignmentStatement(stmt: any): void {
    const value = this.evaluateExpression(stmt.value);
    this.setVariable(stmt.target, value);
  }

  private executeWhileStatement(stmt: any): void {
    while (true) {
      const conditionValue = this.evaluateExpression(stmt.condition);
      if (!this.isTruthy(conditionValue)) {
        break;
      }
      this.executeBlockStatement(stmt.body);
      if (this.shouldReturn) break;
    }
  }

  private executeForStatement(stmt: any): void {
    const iterableValue = this.evaluateExpression(stmt.iterable);

    if (!Array.isArray(iterableValue)) {
      throw new Error("For loop requires a list");
    }

    if (stmt.isIndex) {
      for (let i = 0; i < iterableValue.length; i++) {
        this.pushEnvironment(); // NEW SCOPE EACH ITERATION
        this.defineVariable(stmt.variable, i, false);
        this.executeBlockStatement(stmt.body);
        this.popEnvironment(); // EXIT SCOPE EACH ITERATION
        if (this.shouldReturn) break;
      }
    } else {
      for (const value of iterableValue) {
        this.pushEnvironment(); // NEW SCOPE EACH ITERATION
        this.defineVariable(stmt.variable, value, false);
        this.executeBlockStatement(stmt.body);
        this.popEnvironment(); // EXIT SCOPE EACH ITERATION
        if (this.shouldReturn) break;
      }
    }
  }

  private executeVariableDeclaration(decl: VariableDeclaration): void {
    let value: RuntimeValue = null;

    if (decl.initializer) {
      this.depth++;
      value = this.evaluateExpression(decl.initializer);
      this.depth--;
    }

    this.defineVariable(decl.name, value, decl.mutable ?? true);
    const mutability = decl.mutable ?? true ? "let" : "const";
    this.addStep(`${mutability} ${decl.name} = ${JSON.stringify(value)}`);
  }

  private executeBlockStatement(block: BlockStatement): void {
    this.addStep("Enter block {");
    this.depth++;
    this.pushEnvironment();

    for (const stmt of block.body) {
      this.executeStatement(stmt);
      if (this.shouldReturn) break;
    }

    this.popEnvironment();
    this.depth--;
    this.addStep("Exit block }");
  }

  private executeListPushStatement(stmt: ListPushStatement): void {
    const target = this.evaluateExpression(stmt.target);
    this.depth++;
    const value = this.evaluateExpression(stmt.value);
    this.depth--;

    if (!Array.isArray(target)) {
      throw new Error(
        `Cannot push to non-list type: ${typeof target}`,
      );
    }

    // If value is also an array, spread its elements
    if (Array.isArray(value)) {
      target.push(...value);
      this.addStep(`Push [${value.join(", ")}] to list (spread)`);
    } else {
      target.push(value);
      this.addStep(`Push ${JSON.stringify(value)} to list`);
    }
  }

  private executeReturnStatement(stmt: ReturnStatement): void {
    if (stmt.argument) {
      this.depth++;
      const value = this.evaluateExpression(stmt.argument);
      this.depth--;
      this.returnValue = value;
      this.addStep(`Return ${JSON.stringify(value)}`);
    } else {
      this.returnValue = undefined;
      this.addStep(`Return void`);
    }
    this.shouldReturn = true;
  }

  private executeIfStatement(stmt: IfStatement): void {
    this.depth++;
    const conditionValue = this.evaluateExpression(stmt.condition);
    this.depth--;

    const isTruthy = this.isTruthy(conditionValue);
    this.addStep(`If condition evaluated to: ${isTruthy}`);

    if (isTruthy) {
      this.addStep("Taking if branch");
      this.executeBlockStatement(stmt.consequent);
    } else if (stmt.alternate) {
      this.addStep("Taking else branch");
      this.executeBlockStatement(stmt.alternate);
    } else {
      this.addStep("No else branch, skipping");
    }
  }

  private isTruthy(value: RuntimeValue): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private evaluateExpression(expr: Expression): RuntimeValue {
    switch (expr.kind) {
      case "Literal":
        return this.evaluateLiteral(expr);
      case "Variable":
        return this.evaluateVariable(expr);
      case "BinaryExpression":
        return this.evaluateBinaryExpression(expr);
      case "FunctionCallExpression":
        return this.evaluateFunctionCall(expr);
      case "ListExpression":
        return this.evaluateListExpression(expr);
      case "IndexAccess":
        return this.evaluateIndexAccess(expr as any);
      case "CallExpression":
        throw new Error("CallExpression not yet implemented");
      default: {
        const unknownExpr = expr as unknown as Record<string, unknown>;
        throw new Error(`Unknown expression kind: ${unknownExpr.kind}`);
      }
    }
  }

  private evaluateIndexAccess(expr: any): RuntimeValue {
    const obj = this.evaluateExpression(expr.object);
    const index = this.evaluateExpression(expr.index);

    if (!Array.isArray(obj) || typeof index !== "number") {
      throw new Error("Cannot index non-list or invalid index");
    }
    return obj[index] ?? null;
  }

  private evaluateListExpression(expr: any): RuntimeValue {
    return expr.elements.map((el: Expression) => this.evaluateExpression(el));
  }

  private evaluateLiteral(lit: Literal): RuntimeValue {
    return lit.value;
  }

  private evaluateVariable(v: Expression): RuntimeValue {
    if (v.kind !== "Variable") {
      throw new Error("Expected Variable expression");
    }
    const varName = (v as unknown as { name: string }).name;
    return this.getVariable(varName);
  }

  private evaluateBinaryExpression(expr: BinaryExpression): RuntimeValue {
    this.addStep(`Binary operation: ${expr.operator}`);
    this.depth++;
    const left = this.evaluateExpression(expr.left);
    this.addStep(`Left operand: ${JSON.stringify(left)}`);
    const right = this.evaluateExpression(expr.right);
    this.addStep(`Right operand: ${JSON.stringify(right)}`);
    this.depth--;

    const op = expr.operator as OperatorTokenType;

    // Handle comparisons
    if (op === OperatorTokenType.EQUAL_EQUAL) {
      const result = left === right;
      this.addStep(`Result: ${result}`);
      return result;
    }
    if (op === OperatorTokenType.NOT_EQUAL) {
      const result = left !== right;
      this.addStep(`Result: ${result}`);
      return result;
    }

    if (typeof left !== "number" || typeof right !== "number") {
      throw new Error(
        `Binary operation requires numeric operands, got ${typeof left} and ${typeof right}`,
      );
    }

    // Numeric comparisons
    if (op === OperatorTokenType.LESS_THAN) {
      const result = left < right;
      this.addStep(`Result: ${result}`);
      return result;
    }
    if (op === OperatorTokenType.LESS_EQUAL) {
      const result = left <= right;
      this.addStep(`Result: ${result}`);
      return result;
    }
    if (op === OperatorTokenType.GREATER_THAN) {
      const result = left > right;
      this.addStep(`Result: ${result}`);
      return result;
    }
    if (op === OperatorTokenType.GREATER_EQUAL) {
      const result = left >= right;
      this.addStep(`Result: ${result}`);
      return result;
    }

    // Arithmetic operations
    let result: number;
    switch (op) {
      case OperatorTokenType.PLUS:
        result = left + right;
        break;
      case OperatorTokenType.MINUS:
        result = left - right;
        break;
      case OperatorTokenType.MULTIPLY:
        result = left * right;
        break;
      case OperatorTokenType.DIVIDE:
        if (right === 0) {
          throw new Error("Division by zero");
        }
        result = left / right;
        break;
      case OperatorTokenType.MOD:
        if (right === 0) {
          throw new Error("Modulo by zero");
        }
        result = left % right;
        break;
      default:
        throw new Error(`Unknown operator: ${op}`);
    }

    this.addStep(`Result: ${result}`);
    return result;
  }

  private evaluateFunctionCall(expr: FunctionCallExpression): RuntimeValue {
    if (expr.callee.kind !== "Variable") {
      throw new Error("Only named functions can be called");
    }

    const funcName = expr.callee.name;
    this.addStep(`Calling function: ${funcName}()`);

    // Check for built-in functions first
    if (this.lib.isBuiltIn(funcName)) {
      this.depth++;
      const result = this.lib.call(funcName, expr.arguments);
      this.depth--;
      return result;
    }

    const func = this.functions.get(funcName);

    if (!func) {
      throw new Error(`Undefined function: '${funcName}'`);
    }

    if (expr.arguments.length !== func.params.length) {
      throw new Error(
        `Function '${funcName}' expects ${func.params.length} arguments, got ${expr.arguments.length}`,
      );
    }

    // Evaluate arguments
    this.depth++;
    this.addStep("Evaluating arguments:");
    const argValues = expr.arguments.map((arg, idx) => {
      this.depth++;
      const val = this.evaluateExpression(arg);
      this.addStep(`Arg ${idx}: ${JSON.stringify(val)}`);
      this.depth--;
      return val;
    });
    this.depth--;

    // Create new scope for function execution
    this.pushEnvironment();
    this.depth++;
    this.addStep("Enter function scope");

    // Bind parameters to arguments
    for (let i = 0; i < func.params.length; i++) {
      this.defineVariable(func.params[i].name, argValues[i], false);
      this.addStep(
        `Param ${func.params[i].name} = ${JSON.stringify(argValues[i])}`,
      );
    }

    // Execute function body
    const prevShouldReturn = this.shouldReturn;
    const prevReturnValue = this.returnValue;

    this.shouldReturn = false;
    this.returnValue = undefined;

    this.executeBlockStatement(func.body);

    const result = this.returnValue ?? null;
    this.addStep(`Exit function, returning: ${JSON.stringify(result)}`);

    // Restore previous state
    this.shouldReturn = prevShouldReturn;
    this.returnValue = prevReturnValue;

    this.depth--;
    this.popEnvironment();

    return result;
  }

  getGlobalVariable(name: string): RuntimeValue {
    return this.getVariable(name);
  }

  getAllGlobalVariables(): Record<string, RuntimeValue> {
    const result: Record<string, RuntimeValue> = {};
    for (const [name, variable] of this.globalEnv.variables) {
      result[name] = variable.value;
    }
    return result;
  }

  getExecutionSteps(): string[] {
    return this.steps;
  }

  // Public method for Library to evaluate expressions
  evaluateExpressionPublic(expr: Expression): RuntimeValue {
    return this.evaluateExpression(expr);
  }

  // Public method for Library to add execution steps
  addExecutionStep(message: string): void {
    this.addStep(message);
  }
}
