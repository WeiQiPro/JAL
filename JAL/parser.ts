import {
BinaryExpression,
  BlockStatement,
  BracketTokenType,
  BuiltinFunctionTokenType,
  Expression,
  ForStatement,
  FunctionCallExpression,
  FunctionDeclaration,
  FunctionTokenType,
  IfStatement,
  KeywordTokenType,
  ListPushStatement,
  Literal,
  LiteralTokenType,
  mapTypeTokenToAnnotation,
  MetaTokenType,
  OperatorTokenType,
  Parameter,
  PRECEDENCE,
  Program,
  ReturnStatement,
  ScopeTokenType,
  Statement,
  SyntaxTokenType,
  Token,
  TokenType,
  TypeAnnotation,
  VariableDeclaration,
  VariableTokenType,
  WhileStatement,
} from "./types.ts";

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseProgram(): Program {
    const body: Statement[] = [];

    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    const program: Program = { kind: "Program", body };

    // Infer types after parsing
    this.inferTypesInProgram(program);

    return program;
  }

  private inferTypesInProgram(program: Program): void {
    const globalVars = new Map<string, TypeAnnotation>();
    const functionTable = new Map<string, TypeAnnotation>();

    for (const stmt of program.body) {
      if (stmt.kind === "FunctionDeclaration") {
        functionTable.set(stmt.name, stmt.returnType as TypeAnnotation);
      }
    }

    const inferrer = new TypeInferrer(globalVars, functionTable);

    // First pass: infer all variable types
    this.inferStatementsTypes(program.body, globalVars, inferrer);
  }

  private inferStatementsTypes(
    statements: Statement[],
    scope: Map<string, TypeAnnotation>,
    inferrer: TypeInferrer,
  ): void {
    for (const stmt of statements) {
      if (stmt.kind === "VariableDeclaration") {
        if (!stmt.typeAnnotation && stmt.initializer) {
          stmt.typeAnnotation = inferrer.inferType(stmt.initializer, scope);
        }
        if (stmt.typeAnnotation) {
          scope.set(stmt.name, stmt.typeAnnotation);
        }
      } else if (stmt.kind === "BlockStatement") {
        const blockScope = new Map(scope);
        this.inferStatementsTypes(stmt.body, blockScope, inferrer);
      } else if (stmt.kind === "IfStatement") {
        const blockScope = new Map(scope);
        this.inferStatementsTypes(stmt.consequent.body, blockScope, inferrer);
        if (stmt.alternate) {
          const alternateScope = new Map(scope);
          this.inferStatementsTypes(stmt.alternate.body, alternateScope, inferrer);
        }
      } else if (stmt.kind === "WhileStatement") {
        const blockScope = new Map(scope);
        this.inferStatementsTypes(stmt.body.body, blockScope, inferrer);
      } else if (stmt.kind === "ForStatement") {
        const blockScope = new Map(scope);
        this.inferStatementsTypes(stmt.body.body, blockScope, inferrer);
      } else if (stmt.kind === "FunctionDeclaration") {
        const funcScope = new Map<string, TypeAnnotation>();
        for (const param of stmt.params) {
          funcScope.set(param.name, param.type);
        }
        this.inferStatementsTypes(stmt.body.body, funcScope, inferrer);
      }
    }
  }

  private parseStatement(): Statement {
    if (this.match(VariableTokenType.LET)) {
      return this.parseVariableDeclaration(true);
    }
    if (this.match(VariableTokenType.CONST)) {
      return this.parseVariableDeclaration(false);
    }
    if (this.match(FunctionTokenType.RETURN)) {
      return this.parseReturnStatement();
    }
    if (this.match(FunctionTokenType.FN)) {
      return this.parseFunctionDeclaration();
    }
    if (this.match(KeywordTokenType.IF)) {
      return this.parseIfStatement();
    }
    if (this.match(KeywordTokenType.WHILE)) {
      return this.parseWhileStatement();
    }
    if (this.match(KeywordTokenType.FOR)) {
      return this.parseForStatement();
    }
    if (this.match(ScopeTokenType.SCOPE_OPEN)) {
      return this.parseBlockStatement();
    }

    if (
      this.check(VariableTokenType.VARIABLE) &&
      this.peekAhead(1)?.type === SyntaxTokenType.ASSIGN_EQUAL
    ) {
      const nameToken = this.consume(
        VariableTokenType.VARIABLE,
        "Expected variable name",
      );
      this.consume(SyntaxTokenType.ASSIGN_EQUAL, "Expected '='");
      const expr = this.parseExpression();
      return {
        kind: "AssignmentStatement",
        target: nameToken.value as string,
        value: expr,
      };
    }

    if (
      (this.check(VariableTokenType.VARIABLE) ||
        this.check(LiteralTokenType.VALUE)) &&
      this.peekAhead(1)?.type === BuiltinFunctionTokenType.LIST_PUSH
    ) {
      return this.parseListPushStatement();
    }

    if (
      this.check(VariableTokenType.VARIABLE) ||
      this.check(LiteralTokenType.VALUE)
    ) {
      const expr = this.parseExpression();
      return { kind: "ExpressionStatement", expression: expr };
    }

    throw new Error(
      `Unexpected token ${this.peek().type} at position ${this.pos}`,
    );
  }

  private parseWhileStatement(): WhileStatement {
    this.consume(FunctionTokenType.FN_OPEN_PARAM, "Expected '(' after 'while'");
    const condition = this.parseExpression();
    this.consume(
      FunctionTokenType.FN_END_PARAM,
      "Expected ')' after while condition",
    );
    const body = this.parseBlockStatement();

    return { kind: "WhileStatement", condition, body };
  }

  private parseForStatement(): ForStatement {
    const variableToken = this.consume(
      VariableTokenType.VARIABLE,
      "Expected variable name after 'for'",
    );
    const variable = variableToken.value as string;

    let isIndex = false;
    if (this.match(KeywordTokenType.OF)) {
      isIndex = true;
    } else if (this.match(KeywordTokenType.IN)) {
      isIndex = false;
    } else {
      throw new Error("Expected 'of' or 'in' in for loop");
    }

    const iterable = this.parseExpression();
    const body = this.parseBlockStatement();

    return { kind: "ForStatement", variable, iterable, body, isIndex };
  }

  private parseIfStatement(): IfStatement {
    this.consume(FunctionTokenType.FN_OPEN_PARAM, "Expected '(' after 'if'");
    const condition = this.parseExpression();
    this.consume(FunctionTokenType.FN_END_PARAM, "Expected ')' after if condition");
    const consequent = this.parseBlockStatement();

    let alternate: BlockStatement | undefined = undefined;
    if (this.match(KeywordTokenType.ELSE)) {
      alternate = this.parseBlockStatement();
    }

    return { kind: "IfStatement", condition, consequent, alternate };
  }

  private peekAhead(offset: number): Token | undefined {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return undefined;
    return this.tokens[idx];
  }

  private parseListPushStatement(): ListPushStatement {
    const targetToken = this.consume(
      VariableTokenType.VARIABLE,
      "Expected list variable",
    );

    this.consume(
      BuiltinFunctionTokenType.LIST_PUSH,
      "Expected '<<' for LIST_PUSH",
    );

    const value = this.parseExpression();

    return {
      kind: "ListPushStatement",
      target: { kind: "Variable", name: targetToken.value as string },
      value,
    };
  }

  private parseReturnStatement(): ReturnStatement {
    const expr = this.parseExpression();
    return { kind: "ReturnStatement", argument: expr };
  }

  private parseVariableDeclaration(mutable: boolean): VariableDeclaration {
    const nameToken = this.consume(
      VariableTokenType.VARIABLE,
      "Expected variable name",
    );
    const varName = nameToken.value as string;

    let typeAnnotation: TypeAnnotation | undefined = undefined;
    let initializer: Expression | null = null;

    if (this.match(SyntaxTokenType.INFER_TYPE)) {
      initializer = this.parseExpression();
    } else {
      if (this.match(SyntaxTokenType.ASSIGN_COLON)) {
        const typeToken = this.consume(
          LiteralTokenType.TYPE,
          "Expected type after ':'",
        );
        typeAnnotation = mapTypeTokenToAnnotation(typeToken.value as string);
      }
      this.consume(
        SyntaxTokenType.ASSIGN_EQUAL,
        "Expected '=' after type annotation",
      );
      initializer = this.parseExpression();
    }

    return {
      kind: "VariableDeclaration",
      mutable,
      name: varName,
      typeAnnotation,
      initializer,
    };
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const nameToken = this.consume(
      VariableTokenType.VARIABLE,
      "Expected function name",
    );

    this.consume(
      FunctionTokenType.FN_OPEN_PARAM,
      "Expected '(' after function name",
    );

    const params = this.parseParameterList();

    this.consume(
      FunctionTokenType.FN_END_PARAM,
      "Expected ')' after parameters",
    );

    this.consume(
      SyntaxTokenType.ASSIGN_COLON,
      "Expected ':' before return type",
    );

    const returnTypeToken = this.consume(
      LiteralTokenType.TYPE,
      "Expected return type after ':'",
    );
    const returnType = mapTypeTokenToAnnotation(
      returnTypeToken.value as string,
    );

    const body = this.parseBlockStatement();

    return {
      kind: "FunctionDeclaration",
      name: nameToken.value as string,
      returnType,
      params,
      body,
    };
  }

  private parseParameterList(): Parameter[] {
    const params: Parameter[] = [];
    if (this.check(FunctionTokenType.FN_END_PARAM)) return params;

    do {
      const paramName = this.consume(
        VariableTokenType.VARIABLE,
        "Expected parameter name",
      ).value as string;

      this.consume(
        SyntaxTokenType.ASSIGN_COLON,
        "Expected ':' after parameter name",
      );

      const paramTypeToken = this.consume(
        LiteralTokenType.TYPE,
        "Expected parameter type",
      );
      const paramType = mapTypeTokenToAnnotation(
        paramTypeToken.value as string,
      );

      params.push({ name: paramName, type: paramType });
    } while (this.match(SyntaxTokenType.COMMA));

    return params;
  }

  private parseBlockStatement(): BlockStatement {
    if (!this.check(ScopeTokenType.SCOPE_OPEN)) {
      throw new Error("Expected '{' to start block");
    }
    this.consume(ScopeTokenType.SCOPE_OPEN, "Expected '{' to start block");

    const body: Statement[] = [];

    while (!this.check(ScopeTokenType.SCOPE_END) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    this.consume(ScopeTokenType.SCOPE_END, "Expected '}' to close block");

    return { kind: "BlockStatement", body };
  }

  private parseExpression(): Expression {
    return this.parseBinaryExpression(0);
  }

  private parseBinaryExpression(minPrecedence: number): Expression {
    let left = this.parsePrimary();

    while (true) {
      const opToken = this.peek();
      const precedence = PRECEDENCE[opToken.type as OperatorTokenType];

      if (precedence === undefined || precedence < minPrecedence) {
        break;
      }

      this.advance();

      const right = this.parseBinaryExpression(precedence + 1);

      left = {
        kind: "BinaryExpression",
        operator: opToken.type,
        left,
        right,
      };
    }

    return left;
  }

  private parsePrimary(): Expression {
    let expr: Expression;
    const token = this.peek();

    if (!token || !token.type) {
      throw new Error(
        `Invalid token: ${JSON.stringify(token)} at position ${this.pos}`,
      );
    }

    switch (token.type) {
      case LiteralTokenType.VALUE: {
        this.advance();
        expr = { kind: "Literal", value: token.value! };
        break;
      }
      case VariableTokenType.VARIABLE: {
        this.advance();
        expr = { kind: "Variable", name: token.value as string };

        if (this.check(FunctionTokenType.FN_OPEN_PARAM)) {
          return this.parseFunctionCall(expr);
        }
        break;
      }
      case BracketTokenType.BRACKET_OPEN: {
        return this.parseListLiteral();
      }
      case FunctionTokenType.FN_OPEN_PARAM: {
        this.advance();
        expr = this.parseExpression();
        this.consume(
          FunctionTokenType.FN_END_PARAM,
          "Expected ')' after expression",
        );
        break;
      }
      default:
        throw new Error(`Unexpected token ${token.type}`);
    }

    return this.parsePostfixExpression(expr);
  }

  private parsePostfixExpression(expr: Expression): Expression {
    while (this.check(BracketTokenType.BRACKET_OPEN)) {
      this.advance();
      const index = this.parseExpression();
      this.consume(BracketTokenType.BRACKET_CLOSE, "Expected ']' after index");
      expr = {
        kind: "IndexAccess",
        object: expr,
        index,
      };
    }
    return expr;
  }

  private parseListLiteral(): Expression {
    this.consume(BracketTokenType.BRACKET_OPEN, "Expected '['");
    const elements: Expression[] = [];

    if (!this.check(BracketTokenType.BRACKET_CLOSE)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(SyntaxTokenType.COMMA));
    }

    this.consume(BracketTokenType.BRACKET_CLOSE, "Expected ']'");

    return { kind: "ListExpression", elements };
  }

  private parseFunctionCall(callee: Expression): FunctionCallExpression {
    this.consume(
      FunctionTokenType.FN_OPEN_PARAM,
      "Expected '(' after function call",
    );

    const args: Expression[] = [];

    if (!this.check(FunctionTokenType.FN_END_PARAM)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(SyntaxTokenType.COMMA));
    }

    this.consume(
      FunctionTokenType.FN_END_PARAM,
      "Expected ')' after function call",
    );

    return { kind: "FunctionCallExpression", callee, arguments: args };
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, errorMsg: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(errorMsg + ` at position ${this.pos}`);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.tokens[this.pos - 1];
  }

  private peek(): Token {
    if (this.isAtEnd()) return { type: MetaTokenType.EOF };
    return this.tokens[this.pos];
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length ||
      this.tokens[this.pos].type === MetaTokenType.EOF;
  }
}

class TypeInferrer {
  constructor(
    private globalScope: Map<string, TypeAnnotation>,
    private functionTable: Map<string, TypeAnnotation>,
  ) {}

  inferType(expr: Expression, scope: Map<string, TypeAnnotation>): TypeAnnotation {
    switch (expr.kind) {
      case "Literal":
        return this.inferLiteral(expr);
      case "Variable":
        return this.inferVariable(expr, scope);
      case "BinaryExpression":
        return this.inferBinaryExpression(expr, scope);
      case "FunctionCallExpression":
        return this.inferFunctionCall(expr, scope);
      case "ListExpression":
        return this.inferListExpression(expr, scope);
      case "IndexAccess":
        return this.inferIndexAccess(expr, scope);
      default:
        return { kind: "void" };
    }
  }

  private inferLiteral(lit: Literal): TypeAnnotation {
    if (lit.value === null) return { kind: "void" };
    if (typeof lit.value === "number") {
      return Number.isInteger(lit.value)
        ? { kind: "int", bits: 32 }
        : { kind: "float", bits: 32 };
    }
    if (typeof lit.value === "string") return { kind: "string" };
    if (typeof lit.value === "boolean") return { kind: "bool" };
    if (Array.isArray(lit.value)) return { kind: "list", elementType: { kind: "void" } };
    return { kind: "void" };
  }

  private inferVariable(v: any, scope: Map<string, TypeAnnotation>): TypeAnnotation {
    return scope.get(v.name) || { kind: "void" };
  }

  private inferBinaryExpression(expr: BinaryExpression, scope: Map<string, TypeAnnotation>): TypeAnnotation {
    const leftType = this.inferType(expr.left, scope);
    const rightType = this.inferType(expr.right, scope);
    const op = expr.operator as OperatorTokenType;

    if ([
      OperatorTokenType.EQUAL_EQUAL,
      OperatorTokenType.NOT_EQUAL,
      OperatorTokenType.LESS_THAN,
      OperatorTokenType.LESS_EQUAL,
      OperatorTokenType.GREATER_THAN,
      OperatorTokenType.GREATER_EQUAL,
    ].includes(op)) {
      return { kind: "bool" };
    }

    if ([
      OperatorTokenType.PLUS,
      OperatorTokenType.MINUS,
      OperatorTokenType.MULTIPLY,
      OperatorTokenType.DIVIDE,
      OperatorTokenType.MOD,
    ].includes(op)) {
      if (op === OperatorTokenType.DIVIDE && leftType.kind === "int" && rightType.kind === "int") {
        return leftType;
      }
      return this.widerType(leftType, rightType);
    }

    return { kind: "void" };
  }

  private inferFunctionCall(expr: FunctionCallExpression, scope: Map<string, TypeAnnotation>): TypeAnnotation {
    if (expr.callee.kind !== "Variable") return { kind: "void" };
    
    const funcName = expr.callee.name;
    const builtInReturns: Record<string, TypeAnnotation> = {
      "print": { kind: "void" },
      "len": { kind: "int", bits: 32 },
      "type": { kind: "string" },
      "stringify": { kind: "string" },
      "toNumber": { kind: "int", bits: 32 },
    };

    if (funcName in builtInReturns) {
      return builtInReturns[funcName];
    }

    return this.functionTable.get(funcName) || { kind: "void" };
  }

  private inferListExpression(expr: any, scope: Map<string, TypeAnnotation>): TypeAnnotation {
    if (expr.elements.length === 0) {
      return { kind: "list", elementType: { kind: "void" } };
    }
    const firstType = this.inferType(expr.elements[0], scope);
    return { kind: "list", elementType: firstType };
  }

  private inferIndexAccess(expr: any, scope: Map<string, TypeAnnotation>): TypeAnnotation {
    const objType = this.inferType(expr.object, scope);
    if (objType.kind === "list") {
      return objType.elementType;
    }
    return { kind: "void" };
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
}