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
  "stringify",
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

    for (const stmt of program.body) {
      if (stmt.kind === "FunctionDeclaration") {
        this.registerFunction(stmt);
      }
    }

    this.checkStatementsWithInference(program.body);

    return { errors: this.errors };
  }

  private checkStatementsWithInference(statements: Statement[]): void {
    // Pass 1: Infer types for all variable declarations in this scope
    for (const stmt of statements) {
      if (stmt.kind === "VariableDeclaration") {
        this.registerVariableDeclaration(stmt);
      }
    }

    // Pass 2: Check all statements
    for (const stmt of statements) {
      this.checkStatement(stmt);
    }
  }

  private registerFunction(func: FunctionDeclaration): void {
    const funcSymbol: FunctionSymbol = {
      name: func.name,
      params: func.params,
      returnType: func.returnType || { kind: "void" },
    };
    this.functionTable.set(func.name, funcSymbol);
  }

  private registerVariableDeclaration(decl: VariableDeclaration): void {
    if (!decl.initializer) return;

    let typeToUse = decl.typeAnnotation;

    if (!typeToUse) {
      typeToUse = this.inferExpressionType(decl.initializer);
    }

    this.defineSymbol(decl.name, typeToUse, decl.mutable ?? true);
  }

  private inferExpressionType(expr: Expression): TypeAnnotation {
    switch (expr.kind) {
      case "Literal":
        return this.checkLiteral(expr);
      case "Variable":
        return this.checkVariable(expr);
      case "BinaryExpression":
        return this.inferBinaryExpressionType(expr);
      case "FunctionCallExpression":
        return this.inferFunctionCallType(expr);
      case "ListExpression":
        return this.inferListExpressionType(expr);
      case "IndexAccess":
        return this.inferIndexAccessType(expr);
      default:
        return { kind: "void" };
    }
  }

  private inferBinaryExpressionType(expr: BinaryExpression): TypeAnnotation {
    const leftType = this.inferExpressionType(expr.left);
    const rightType = this.inferExpressionType(expr.right);
    const op = expr.operator as OperatorTokenType;

    if (
      op === OperatorTokenType.EQUAL_EQUAL ||
      op === OperatorTokenType.NOT_EQUAL ||
      op === OperatorTokenType.LESS_THAN ||
      op === OperatorTokenType.LESS_EQUAL ||
      op === OperatorTokenType.GREATER_THAN ||
      op === OperatorTokenType.GREATER_EQUAL
    ) {
      return { kind: "bool" };
    }

    if (
      op === OperatorTokenType.PLUS ||
      op === OperatorTokenType.MINUS ||
      op === OperatorTokenType.MULTIPLY ||
      op === OperatorTokenType.DIVIDE ||
      op === OperatorTokenType.MOD
    ) {
      if (op === OperatorTokenType.DIVIDE && leftType.kind === "int" && rightType.kind === "int") {
        return leftType;
      }
      return this.widerType(leftType, rightType);
    }

    return { kind: "void" };
  }

  private inferFunctionCallType(expr: FunctionCallExpression): TypeAnnotation {
    if (expr.callee.kind !== "Variable") return { kind: "void" };

    const funcName = expr.callee.name;
    const funcSymbol = this.functionTable.get(funcName);

    if (funcSymbol) {
      return funcSymbol.returnType;
    }

    return { kind: "void" };
  }

  private inferListExpressionType(expr: any): TypeAnnotation {
    if (expr.elements.length === 0) {
      return { kind: "list", elementType: { kind: "void" } };
    }
    const firstType = this.inferExpressionType(expr.elements[0]);
    return { kind: "list", elementType: firstType };
  }

  private inferIndexAccessType(expr: any): TypeAnnotation {
    const objType = this.inferExpressionType(expr.object);
    if (objType.kind === "list") {
      return objType.elementType;
    }
    return { kind: "void" };
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
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }
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
      case "WhileStatement":
        this.checkWhileStatement(stmt);
        break;
      case "ForStatement":
        this.checkForStatement(stmt);
        break;
      case "AssignmentStatement":
        this.checkAssignmentStatement(stmt);
        break;
      default:
        this.error(`Unknown statement kind: ${(stmt as any).kind}`);
    }
  }

  private checkAssignmentStatement(stmt: any): void {
    const symbol = this.resolveSymbol(stmt.target);
    if (!symbol) {
      this.error(`Undefined variable: '${stmt.target}'`);
      return;
    }
    if (!symbol.mutable) {
      this.error(`Cannot assign to immutable variable '${stmt.target}'`);
      return;
    }
    const valueType = this.checkExpression(stmt.value);
    if (!this.typesMatch(symbol.type, valueType)) {
      this.error(
        `Type mismatch: cannot assign ${this.typeToString(valueType)} to ${
          this.typeToString(symbol.type)
        }`,
      );
    }
  }

  private checkWhileStatement(stmt: any): void {
    const conditionType = this.checkExpression(stmt.condition);
    if (conditionType.kind !== "bool") {
      this.error(
        `While condition must be boolean, got ${
          this.typeToString(conditionType)
        }`,
      );
    }
    this.checkBlockStatement(stmt.body);
  }

  private checkForStatement(stmt: any): void {
    const iterableType = this.checkExpression(stmt.iterable);

    if (iterableType.kind !== "list") {
      this.error(
        `For loop requires list, got ${this.typeToString(iterableType)}`,
      );
      return;
    }

    this.pushScope();

    if (stmt.isIndex) {
      this.defineSymbol(stmt.variable, { kind: "int", bits: 32 }, false);
    } else {
      this.defineSymbol(stmt.variable, iterableType.elementType, false);
    }

    this.checkBlockStatement(stmt.body);
    this.popScope();
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
  }

  private checkBlockStatement(block: BlockStatement): void {
    this.pushScope();
    this.checkStatementsWithInference(block.body);
    this.popScope();
  }

  private checkFunctionDeclaration(func: FunctionDeclaration): void {
    const prevReturnType = this.currentFunctionReturnType;
    this.currentFunctionReturnType = func.returnType || { kind: "void" };

    this.pushScope();

    for (const param of func.params) {
      this.defineSymbol(param.name, param.type, false);
    }

    this.checkStatementsWithInference(func.body.body);

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

    if (stmt.target.kind === "Variable") {
      const varName = (stmt.target as any).name;
      const symbol = this.resolveSymbol(varName);
      if (symbol && !symbol.mutable) {
        this.error(`Cannot modify immutable list '${varName}'`);
        return;
      }
    }

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

    if (!stmt.argument) {
      if (this.currentFunctionReturnType.kind !== "void") {
        this.error(
          `Function expects return value of type ${
            this.typeToString(this.currentFunctionReturnType)
          }, but got empty return`,
        );
      }
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
      case "ListExpression":
        return this.checkListExpression(expr);
      case "IndexAccess":
        return this.checkIndexAccess(expr);
      default:
        this.error(`Unknown expression kind: ${(expr as any).kind}`);
        return { kind: "void" };
    }
  }

  private checkListExpression(expr: any): TypeAnnotation {
    if (expr.elements.length === 0) {
      return { kind: "list", elementType: { kind: "void" } };
    }
    const firstType = this.checkExpression(expr.elements[0]);
    for (const elem of expr.elements) {
      const elemType = this.checkExpression(elem);
      if (!this.typesMatch(firstType, elemType)) {
        this.error("List elements must all be the same type");
      }
    }
    return { kind: "list", elementType: firstType };
  }

  private checkIndexAccess(expr: any): TypeAnnotation {
    const objType = this.checkExpression(expr.object);
    const indexType = this.checkExpression(expr.index);

    if (objType.kind !== "list") {
      this.error(`Cannot index non-list type: ${this.typeToString(objType)}`);
      return { kind: "void" };
    }
    if (indexType.kind !== "int") {
      this.error(`Index must be integer, got ${this.typeToString(indexType)}`);
    }
    return objType.elementType;
  }

  private checkLiteral(lit: Literal): TypeAnnotation {
    if (lit.value === null) {
      return { kind: "void" };
    }

    if (typeof lit.value === "number") {
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

    if (
      op === OperatorTokenType.EQUAL_EQUAL ||
      op === OperatorTokenType.NOT_EQUAL ||
      op === OperatorTokenType.LESS_THAN ||
      op === OperatorTokenType.LESS_EQUAL ||
      op === OperatorTokenType.GREATER_THAN ||
      op === OperatorTokenType.GREATER_EQUAL
    ) {
      if (!this.isNumeric(leftType) || !this.isNumeric(rightType)) {
        this.error(
          `Cannot compare ${this.typeToString(leftType)} and ${
            this.typeToString(rightType)
          }`,
        );
      }
      return { kind: "bool" };
    }

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
      }

      if (op === OperatorTokenType.DIVIDE && leftType.kind === "int" && rightType.kind === "int") {
        return leftType;
      }

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

    const BUILT_IN = new Set(["print", "len", "type", "stringify", "toNumber"]);
    if (BUILT_IN.has(funcName)) {
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
        for (const arg of args) {
          this.checkExpression(arg);
        }
        return { kind: "void" };
      case "len":
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
        if (args.length !== 1) {
          this.error("type() expects 1 argument");
        } else {
          this.checkExpression(args[0]);
        }
        return { kind: "string" };
      case "stringify":
        if (args.length !== 1) {
          this.error("stringify() expects 1 argument");
        } else {
          this.checkExpression(args[0]);
        }
        return { kind: "string" };
      case "toNumber":
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
    if (t1.kind === "float" || t2.kind === "float") {
      const bits = Math.max(
        t1.kind === "float" ? t1.bits : 32,
        t2.kind === "float" ? t2.bits : 32,
      );
      return { kind: "float", bits: bits as 32 | 64 };
    }

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