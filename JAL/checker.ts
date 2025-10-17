import {
  BinaryExpression,
  BlockStatement,
  Expression,
  FunctionCallExpression,
  FunctionDeclaration,
  FunctionSymbol,
  ListPushStatement,
  Literal,
  OperatorTokenType,
  Program,
  ReturnStatement,
  Statement,
  Symbol,
  TypeAnnotation,
  VariableDeclaration,
} from "./types.ts";

const BUILT_IN_FUNCTIONS = new Set([
  "print",
  "len",
  "type",
  "toString",
  "toNumber",
]);

export class TypeChecker {
  private symbolTable: Map<string, Symbol> = new Map();
  private functionTable: Map<string, FunctionSymbol> = new Map();
  private currentFunctionReturnType: TypeAnnotation | null = null;
  private errors: string[] = [];
  private scopes: Map<string, Symbol>[] = [];

  check(program: Program): { errors: string[] } {
    this.errors = [];
    this.symbolTable.clear();
    this.functionTable.clear();
    this.scopes = [];

    // First pass: collect function declarations
    for (const stmt of program.body) {
      if (stmt.kind === "FunctionDeclaration") {
        this.registerFunction(stmt);
      }
    }

    // Second pass: check the program
    for (const stmt of program.body) {
      this.checkStatement(stmt);
    }

    return { errors: this.errors };
  }

  private registerFunction(func: FunctionDeclaration): void {
    const funcSymbol: FunctionSymbol = {
      name: func.name,
      params: func.params,
      returnType: func.returnType || { kind: "void" },
    };
    this.functionTable.set(func.name, funcSymbol);
  }

  private pushScope(): void {
    this.scopes.push(new Map());
  }

  private popScope(): void {
    this.scopes.pop();
  }

  private defineSymbol(
    name: string,
    type: TypeAnnotation,
    mutable: boolean,
  ): void {
    const symbol: Symbol = { name, type, mutable };

    if (this.scopes.length > 0) {
      const currentScope = this.scopes[this.scopes.length - 1];
      if (currentScope.has(name)) {
        this.error(`Variable '${name}' already defined in current scope`);
        return;
      }

      // Check if trying to redeclare a const from outer scope
      const existingSymbol = this.resolveSymbol(name);
      if (existingSymbol && !existingSymbol.mutable) {
        this.error(
          `Cannot redeclare const variable '${name}' from outer scope`,
        );
        return;
      }

      currentScope.set(name, symbol);
    } else {
      if (this.symbolTable.has(name)) {
        this.error(`Variable '${name}' already defined`);
        return;
      }
      this.symbolTable.set(name, symbol);
    }
  }

  private resolveSymbol(name: string): Symbol | undefined {
    // Search from innermost to outermost scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }
    // Search global scope
    return this.symbolTable.get(name);
  }

  private checkStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        this.checkVariableDeclaration(stmt);
        break;
      case "ExpressionStatement":
        this.checkExpression(stmt.expression);
        break;
      case "BlockStatement":
        this.checkBlockStatement(stmt);
        break;
      case "FunctionDeclaration":
        this.checkFunctionDeclaration(stmt);
        break;
      case "ListPushStatement":
        this.checkListPushStatement(stmt);
        break;
      case "ReturnStatement":
        this.checkReturnStatement(stmt);
        break;
      case "IfStatement":
        this.checkIfStatement(stmt);
        break;
      default:
        this.error(`Unknown statement kind: ${(stmt as any).kind}`);
    }
  }

  private checkIfStatement(stmt: any): void {
    const conditionType = this.checkExpression(stmt.condition);

    if (conditionType.kind !== "bool") {
      this.error(
        `If condition must be boolean, got ${this.typeToString(conditionType)}`,
      );
    }

    this.checkBlockStatement(stmt.consequent);

    if (stmt.alternate) {
      this.checkBlockStatement(stmt.alternate);
    }
  }

  private checkVariableDeclaration(decl: VariableDeclaration): void {
    if (!decl.initializer) {
      this.error(`Variable '${decl.name}' must have an initializer`);
      return;
    }

    const initType = this.checkExpression(decl.initializer);

    if (decl.typeAnnotation) {
      if (!this.typesMatch(decl.typeAnnotation, initType)) {
        this.error(
          `Type mismatch for variable '${decl.name}': expected ${
            this.typeToString(decl.typeAnnotation)
          }, got ${this.typeToString(initType)}`,
        );
      }
    }

    const typeToUse = decl.typeAnnotation || initType;
    this.defineSymbol(decl.name, typeToUse, decl.mutable ?? true);
  }

  private checkBlockStatement(block: BlockStatement): void {
    this.pushScope();
    for (const stmt of block.body) {
      this.checkStatement(stmt);
    }
    this.popScope();
  }

  private checkFunctionDeclaration(func: FunctionDeclaration): void {
    const prevReturnType = this.currentFunctionReturnType;
    this.currentFunctionReturnType = func.returnType || { kind: "void" };

    this.pushScope();

    // Define parameters in function scope
    for (const param of func.params) {
      this.defineSymbol(param.name, param.type, false);
    }

    // Check function body
    this.checkBlockStatement(func.body);

    this.popScope();
    this.currentFunctionReturnType = prevReturnType;
  }

  private checkListPushStatement(stmt: ListPushStatement): void {
    const targetType = this.checkExpression(stmt.target);
    const valueType = this.checkExpression(stmt.value);

    if (targetType.kind !== "list") {
      this.error(
        `Cannot push to non-list type: ${this.typeToString(targetType)}`,
      );
      return;
    }

    // Check if target is mutable
    if (stmt.target.kind === "Variable") {
      const varName = (stmt.target as any).name;
      const symbol = this.resolveSymbol(varName);
      if (symbol && !symbol.mutable) {
        this.error(`Cannot modify immutable list '${varName}'`);
        return;
      }
    }

    // If list has element type, check compatibility
    if (targetType.elementType && targetType.elementType.kind !== "void") {
      if (!this.typesMatch(targetType.elementType, valueType)) {
        this.error(
          `Type mismatch in list push: expected ${
            this.typeToString(targetType.elementType)
          }, got ${this.typeToString(valueType)}`,
        );
      }
    }
  }

  private checkReturnStatement(stmt: ReturnStatement): void {
    if (!this.currentFunctionReturnType) {
      this.error("Return statement outside of function");
      return;
    }

    const exprType = this.checkExpression(stmt.argument);

    if (!this.typesMatch(this.currentFunctionReturnType, exprType)) {
      this.error(
        `Return type mismatch: expected ${
          this.typeToString(this.currentFunctionReturnType)
        }, got ${this.typeToString(exprType)}`,
      );
    }
  }

  private checkExpression(expr: Expression): TypeAnnotation {
    switch (expr.kind) {
      case "Literal":
        return this.checkLiteral(expr);
      case "Variable":
        return this.checkVariable(expr);
      case "BinaryExpression":
        return this.checkBinaryExpression(expr);
      case "FunctionCallExpression":
        return this.checkFunctionCall(expr);
      default:
        this.error(`Unknown expression kind: ${(expr as any).kind}`);
        return { kind: "void" };
    }
  }

  private checkLiteral(lit: Literal): TypeAnnotation {
    if (lit.value === null) {
      return { kind: "void" };
    }

    if (typeof lit.value === "number") {
      // Check if it's a float or int
      if (Number.isInteger(lit.value)) {
        return { kind: "int", bits: 32 };
      } else {
        return { kind: "float", bits: 32 };
      }
    }

    if (typeof lit.value === "string") {
      return { kind: "string" };
    }

    if (typeof lit.value === "boolean") {
      return { kind: "bool" };
    }

    if (Array.isArray(lit.value)) {
      return { kind: "list", elementType: { kind: "void" } };
    }

    return { kind: "void" };
  }

  private checkVariable(v: any): TypeAnnotation {
    const symbol = this.resolveSymbol(v.name);

    if (!symbol) {
      this.error(`Undefined variable: '${v.name}'`);
      return { kind: "void" };
    }

    return symbol.type;
  }

  private checkBinaryExpression(expr: BinaryExpression): TypeAnnotation {
    const leftType = this.checkExpression(expr.left);
    const rightType = this.checkExpression(expr.right);

    const op = expr.operator as OperatorTokenType;

    // Comparison operators return bool
    if (
      op === OperatorTokenType.EQUAL_EQUAL ||
      op === OperatorTokenType.NOT_EQUAL ||
      op === OperatorTokenType.LESS_THAN ||
      op === OperatorTokenType.LESS_EQUAL ||
      op === OperatorTokenType.GREATER_THAN ||
      op === OperatorTokenType.GREATER_EQUAL
    ) {
      // Both sides must be numeric
      if (!this.isNumeric(leftType) || !this.isNumeric(rightType)) {
        this.error(
          `Cannot compare ${this.typeToString(leftType)} and ${
            this.typeToString(rightType)
          }`,
        );
      }
      return { kind: "bool" };
    }

    // For arithmetic operations, both sides must be numeric
    if (
      op === OperatorTokenType.PLUS ||
      op === OperatorTokenType.MINUS ||
      op === OperatorTokenType.MULTIPLY ||
      op === OperatorTokenType.DIVIDE ||
      op === OperatorTokenType.MOD
    ) {
      if (!this.isNumeric(leftType) || !this.isNumeric(rightType)) {
        this.error(
          `Cannot perform ${op} on ${this.typeToString(leftType)} and ${
            this.typeToString(rightType)
          }`,
        );
        return { kind: "void" };
      }

      // Return the wider type
      return this.widerType(leftType, rightType);
    }

    return { kind: "void" };
  }

  private checkFunctionCall(expr: FunctionCallExpression): TypeAnnotation {
    if (expr.callee.kind !== "Variable") {
      this.error("Only named functions can be called");
      return { kind: "void" };
    }

    const funcName = expr.callee.name;

    // Check if it's a built-in function
    if (BUILT_IN_FUNCTIONS.has(funcName)) {
      return this.checkBuiltInFunctionCall(funcName, expr.arguments);
    }

    const funcSymbol = this.functionTable.get(funcName);

    if (!funcSymbol) {
      this.error(`Undefined function: '${funcName}'`);
      return { kind: "void" };
    }

    if (expr.arguments.length !== funcSymbol.params.length) {
      this.error(
        `Function '${funcName}' expects ${funcSymbol.params.length} arguments, got ${expr.arguments.length}`,
      );
      return funcSymbol.returnType;
    }

    // Check argument types
    for (let i = 0; i < expr.arguments.length; i++) {
      const argType = this.checkExpression(expr.arguments[i]);
      const paramType = funcSymbol.params[i].type;

      if (!this.typesMatch(paramType, argType)) {
        this.error(
          `Argument ${i + 1} type mismatch in call to '${funcName}': expected ${
            this.typeToString(paramType)
          }, got ${this.typeToString(argType)}`,
        );
      }
    }

    return funcSymbol.returnType;
  }

  private checkBuiltInFunctionCall(
    funcName: string,
    args: Expression[],
  ): TypeAnnotation {
    switch (funcName) {
      case "print":
        // print accepts any arguments and returns void
        for (const arg of args) {
          this.checkExpression(arg);
        }
        return { kind: "void" };
      case "len":
        // len returns int
        if (args.length !== 1) {
          this.error("len() expects 1 argument");
        } else {
          const argType = this.checkExpression(args[0]);
          if (argType.kind !== "string" && argType.kind !== "list") {
            this.error(
              `len() requires string or list, got ${
                this.typeToString(argType)
              }`,
            );
          }
        }
        return { kind: "int", bits: 32 };
      case "type":
        // type returns string
        if (args.length !== 1) {
          this.error("type() expects 1 argument");
        } else {
          this.checkExpression(args[0]);
        }
        return { kind: "string" };
      case "toString":
        // toString returns string
        if (args.length !== 1) {
          this.error("toString() expects 1 argument");
        } else {
          this.checkExpression(args[0]);
        }
        return { kind: "string" };
      case "toNumber":
        // toNumber returns int
        if (args.length !== 1) {
          this.error("toNumber() expects 1 argument");
        } else {
          this.checkExpression(args[0]);
        }
        return { kind: "int", bits: 32 };
      default:
        return { kind: "void" };
    }
  }

  private typesMatch(t1: TypeAnnotation, t2: TypeAnnotation): boolean {
    if (t1.kind !== t2.kind) return false;

    if (t1.kind === "int" && t2.kind === "int") {
      return t1.bits === t2.bits;
    }

    if (t1.kind === "float" && t2.kind === "float") {
      return t1.bits === t2.bits;
    }

    if (t1.kind === "list" && t2.kind === "list") {
      if (t1.elementType.kind === "void" || t2.elementType.kind === "void") {
        return true;
      }
      return this.typesMatch(t1.elementType, t2.elementType);
    }

    return true;
  }

  private isNumeric(t: TypeAnnotation): boolean {
    return t.kind === "int" || t.kind === "float";
  }

  private widerType(t1: TypeAnnotation, t2: TypeAnnotation): TypeAnnotation {
    // If either is float, result is float
    if (t1.kind === "float" || t2.kind === "float") {
      const bits = Math.max(
        t1.kind === "float" ? t1.bits : 32,
        t2.kind === "float" ? t2.bits : 32,
      );
      return { kind: "float", bits: bits as 32 | 64 };
    }

    // Both are int, return the wider int
    if (t1.kind === "int" && t2.kind === "int") {
      const bits = Math.max(t1.bits, t2.bits);
      return { kind: "int", bits: bits as 8 | 16 | 32 | 64 };
    }

    return t1;
  }

  private typeToString(t: TypeAnnotation): string {
    switch (t.kind) {
      case "int":
        return `i${t.bits}`;
      case "float":
        return `f${t.bits}`;
      case "bool":
        return "bool";
      case "string":
        return "string";
      case "list":
        return `list<${this.typeToString(t.elementType)}>`;
      case "void":
        return "void";
    }
  }

  private error(msg: string): void {
    this.errors.push(msg);
  }

  getErrors(): string[] {
    return this.errors;
  }
}
