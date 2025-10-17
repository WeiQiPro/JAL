import {
  BlockStatement,
  BuiltinFunctionTokenType,
  Expression,
  FunctionCallExpression,
  FunctionDeclaration,
  FunctionTokenType,
  IfStatement,
  KeywordTokenType,
  ListPushStatement,
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
} from "./types.ts";

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private functionReturnTypes: Map<string, string> = new Map();

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseProgram(): Program {
    const body: Statement[] = [];

    // First pass: collect function return types
    this.collectFunctionReturnTypes();

    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    return { kind: "Program", body };
  }

  private collectFunctionReturnTypes(): void {
    // Scan through tokens to find function declarations and their return types
    const savedPos = this.pos;
    this.pos = 0;

    while (!this.isAtEnd()) {
      if (this.check(FunctionTokenType.FN)) {
        this.advance(); // consume 'fn'
        const nameToken = this.peek();
        if (nameToken.type === VariableTokenType.VARIABLE) {
          const funcName = nameToken.value as string;
          this.advance(); // consume function name

          // Skip to the return type
          // Look for pattern: ) : TYPE
          while (
            !this.isAtEnd() && this.peek().type !== SyntaxTokenType.ASSIGN_COLON
          ) {
            this.advance();
          }

          if (this.peek().type === SyntaxTokenType.ASSIGN_COLON) {
            this.advance(); // consume ':'
            const typeToken = this.peek();
            if (typeToken.type === LiteralTokenType.TYPE) {
              const returnType = typeToken.value as string;
              this.functionReturnTypes.set(funcName, returnType);
            }
          }
        }
      } else {
        this.advance();
      }
    }

    // Restore position
    this.pos = savedPos;
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
    if (this.match(ScopeTokenType.SCOPE_OPEN)) {
      return this.parseBlockStatement();
    }

    // Check for LIST_PUSH before trying to parse as expression
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

  private parseIfStatement(): IfStatement {
    // Already consumed 'if'
    this.consume(
      FunctionTokenType.FN_OPEN_PARAM,
      "Expected '(' after 'if'",
    );

    const condition = this.parseExpression();

    this.consume(
      FunctionTokenType.FN_END_PARAM,
      "Expected ')' after if condition",
    );

    const consequent = this.parseBlockStatement();

    let alternate: BlockStatement | undefined = undefined;

    if (this.match(KeywordTokenType.ELSE)) {
      alternate = this.parseBlockStatement();
    }

    return {
      kind: "IfStatement",
      condition,
      consequent,
      alternate,
    };
  }

  private peekAhead(offset: number): Token | undefined {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return undefined;
    return this.tokens[idx];
  }

  private parseListPushStatement(): ListPushStatement {
    // Consume the target variable
    const targetToken = this.consume(
      VariableTokenType.VARIABLE,
      "Expected list variable",
    );

    // Consume the LIST_PUSH operator (<<)
    this.consume(
      BuiltinFunctionTokenType.LIST_PUSH,
      "Expected '<<' for LIST_PUSH",
    );

    // Parse the value to push into the list
    const value = this.parseExpression();

    return {
      kind: "ListPushStatement",
      target: { kind: "Variable", name: targetToken.value as string },
      value,
    };
  }

  private parseReturnStatement(): ReturnStatement {
    const expr = this.parseExpression();
    return {
      kind: "ReturnStatement",
      argument: expr,
    };
  }

  private parseVariableDeclaration(mutable: boolean): VariableDeclaration {
    const nameToken = this.consume(
      VariableTokenType.VARIABLE,
      "Expected variable name",
    );

    let typeAnnotation: TypeAnnotation | undefined = undefined;
    let initializer: Expression | null = null;

    if (this.match(SyntaxTokenType.INFER_TYPE)) {
      initializer = this.parseExpression();
      const inferredTypeStr = this.inferTypeFromExpression(initializer);
      if (inferredTypeStr !== "void") {
        typeAnnotation = mapTypeTokenToAnnotation(inferredTypeStr);
      }
    } else {
      if (this.match(SyntaxTokenType.ASSIGN_COLON)) {
        const typeToken = this.consume(
          LiteralTokenType.TYPE,
          "Expected type after ':'",
        );
        // Convert string to TypeAnnotation
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
      name: nameToken.value as string,
      typeAnnotation,
      initializer,
    };
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    // Already consumed 'fn'
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

    // Consume ':' before return type
    this.consume(
      SyntaxTokenType.ASSIGN_COLON,
      "Expected ':' before return type",
    );

    const returnTypeToken = this.consume(
      LiteralTokenType.TYPE,
      "Expected return type after ':'",
    );
    // Convert string to TypeAnnotation
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
      // Convert string to TypeAnnotation
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
    return this.parseBinaryExpression(this.parsePrimary(), 0);
  }

  private parseBinaryExpression(
    left: Expression,
    minPrecedence: number,
  ): Expression {
    while (true) {
      const opToken = this.peek();
      const precedence = PRECEDENCE[opToken.type as OperatorTokenType];

      if (precedence === undefined || precedence < minPrecedence) {
        break;
      }

      this.advance(); // consume operator

      let right = this.parsePrimary();

      // Check for right-side binary expressions with higher precedence
      const nextPrecedence = PRECEDENCE[this.peek().type as OperatorTokenType];
      if (nextPrecedence !== undefined && nextPrecedence > precedence) {
        right = this.parseBinaryExpression(right, precedence + 1);
      }

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
    const token = this.peek();

    switch (token.type) {
      case LiteralTokenType.VALUE: {
        this.advance();
        return { kind: "Literal", value: token.value! };
      }
      case VariableTokenType.VARIABLE: {
        this.advance();

        // Function call: check for '(' aka FN_OPEN_PARAM
        if (this.check(FunctionTokenType.FN_OPEN_PARAM)) {
          return this.parseFunctionCall({
            kind: "Variable",
            name: token.value as string,
          });
        }
        return { kind: "Variable", name: token.value as string };
      }
      case FunctionTokenType.FN_OPEN_PARAM: {
        this.advance();
        const expr = this.parseExpression();
        this.consume(
          FunctionTokenType.FN_END_PARAM,
          "Expected ')' after expression",
        );
        return expr;
      }
      default:
        throw new Error(
          `Unexpected token ${token.type} in expression at position ${this.pos}`,
        );
    }
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

  private inferTypeFromExpression(expr: Expression): string {
    if (expr.kind === "Literal") {
      if (typeof expr.value === "number") {
        // Check if it's a float or int
        if (Number.isInteger(expr.value)) {
          return "int";
        } else {
          return "float";
        }
      }
      if (typeof expr.value === "string") return "string";
      if (typeof expr.value === "boolean") return "bool";
      if (Array.isArray(expr.value)) return "list";
      return "void";
    }

    if (expr.kind === "BinaryExpression") {
      const leftType = this.inferTypeFromExpression(expr.left);
      const rightType = this.inferTypeFromExpression(expr.right);

      if (leftType === "float" || rightType === "float") return "float";
      if (leftType === "int" || rightType === "int") return "int";

      return leftType !== "void" ? leftType : "int";
    }

    if (expr.kind === "FunctionCallExpression") {
      if (expr.callee.kind === "Variable") {
        const funcName = expr.callee.name;
        const returnType = this.functionReturnTypes.get(funcName);
        if (returnType) {
          return returnType;
        }
      }
      return "void";
    }

    if (expr.kind === "Variable") {
      return "void";
    }

    return "void";
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
    console.log("Character: ", this.peek());
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
