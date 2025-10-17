import {
  BinaryExpression,
  BlockStatement,
  Expression,
  FunctionCallExpression,
  FunctionDeclaration,
  ListPushStatement,
  Literal,
  OperatorTokenType,
  Program,
  ReturnStatement,
  Statement,
  VariableDeclaration,
  RuntimeValue,
  Environment,
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
  private lib: Library;

  constructor() {
    this.globalEnv = {
      variables: new Map(),
      parent: null,
    };
    this.currentEnv = this.globalEnv;
    this.lib = new Library(this);
  }

  execute(program: Program): void {
    try {
      // First pass: collect function declarations
      for (const stmt of program.body) {
        if (stmt.kind === "FunctionDeclaration") {
          this.registerFunction(stmt);
        }
      }

      // Second pass: execute statements (skip function declarations and expression statements)
      for (const stmt of program.body) {
        if (stmt.kind === "FunctionDeclaration" || stmt.kind === "ExpressionStatement") {
          continue;
        }
        this.executeStatement(stmt);
        if (this.shouldReturn) break;
      }

      // Third pass: execute main function if it exists
      if (this.functions.has("main")) {
        this.shouldReturn = false;
        this.returnValue = undefined;
        const mainFunc = this.functions.get("main")!;
        
        this.pushEnvironment();
        this.executeBlockStatement(mainFunc.body);
        this.popEnvironment();
      }
    } catch (error) {
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
    mutable: boolean
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
        this.evaluateExpression(stmt.expression);
        break;
      case "BlockStatement":
        this.executeBlockStatement(stmt);
        break;
      case "FunctionDeclaration":
        break;
      case "ListPushStatement":
        this.executeListPushStatement(stmt);
        break;
      case "ReturnStatement":
        this.executeReturnStatement(stmt);
        break;
      default: {
        const unknownStmt = stmt as Record<string, unknown>;
        throw new Error(`Unknown statement kind: ${unknownStmt.kind}`);
      }
    }
  }

  private executeVariableDeclaration(decl: VariableDeclaration): void {
    let value: RuntimeValue = null;

    if (decl.initializer) {
      value = this.evaluateExpression(decl.initializer);
    }

    this.defineVariable(decl.name, value, decl.mutable ?? true);
  }

  private executeBlockStatement(block: BlockStatement): void {
    this.pushEnvironment();

    for (const stmt of block.body) {
      this.executeStatement(stmt);
      if (this.shouldReturn) break;
    }

    this.popEnvironment();
  }

  private executeListPushStatement(stmt: ListPushStatement): void {
    const target = this.evaluateExpression(stmt.target);
    const value = this.evaluateExpression(stmt.value);

    if (!Array.isArray(target)) {
      throw new Error(
        `Cannot push to non-list type: ${typeof target}`
      );
    }

    if (Array.isArray(value)) {
      target.push(...value);
    } else {
      target.push(value);
    }
  }

  private executeReturnStatement(stmt: ReturnStatement): void {
    this.returnValue = this.evaluateExpression(stmt.argument);
    this.shouldReturn = true;
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
      case "CallExpression":
        throw new Error("CallExpression not yet implemented");
      default: {
        const unknownExpr = expr as unknown as Record<string, unknown>;
        throw new Error(`Unknown expression kind: ${unknownExpr.kind}`);
      }
    }
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
    const left = this.evaluateExpression(expr.left);
    const right = this.evaluateExpression(expr.right);

    if (typeof left !== "number" || typeof right !== "number") {
      throw new Error(
        `Binary operation requires numeric operands, got ${typeof left} and ${typeof right}`
      );
    }

    const op = expr.operator as OperatorTokenType;
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

    return result;
  }

  private evaluateFunctionCall(expr: FunctionCallExpression): RuntimeValue {
    if (expr.callee.kind !== "Variable") {
      throw new Error("Only named functions can be called");
    }

    const funcName = expr.callee.name;
    
    if (this.lib.isBuiltIn(funcName)) {
      return this.lib.call(funcName, expr.arguments);
    }

    const func = this.functions.get(funcName);

    if (!func) {
      throw new Error(`Undefined function: '${funcName}'`);
    }

    if (expr.arguments.length !== func.params.length) {
      throw new Error(
        `Function '${funcName}' expects ${func.params.length} arguments, got ${expr.arguments.length}`
      );
    }

    const argValues = expr.arguments.map((arg) =>
      this.evaluateExpression(arg)
    );

    this.pushEnvironment();

    for (let i = 0; i < func.params.length; i++) {
      this.defineVariable(func.params[i].name, argValues[i], false);
    }

    const prevShouldReturn = this.shouldReturn;
    const prevReturnValue = this.returnValue;

    this.shouldReturn = false;
    this.returnValue = undefined;

    this.executeBlockStatement(func.body);

    const result = this.returnValue ?? null;

    this.shouldReturn = prevShouldReturn;
    this.returnValue = prevReturnValue;

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

  evaluateExpressionPublic(expr: Expression): RuntimeValue {
    return this.evaluateExpression(expr);
  }
}