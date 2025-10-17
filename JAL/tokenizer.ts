import {
  BracketTokenType,
  BuiltinFunctionTokenType,
  FunctionTokenType,
  KeywordTokenType,
  LiteralTokenType,
  MetaTokenType,
  OperatorTokenType,
  ScopeTokenType,
  SyntaxTokenType,
  Token,
  VariableTokenType,
} from "./types.ts";

export class Tokenizer {
  private src: string;
  private pos = 0;
  #tokens: Token[] = [];

  constructor(source: string) {
    this.src = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      const char = this.peek();
      if (char === undefined) break;

      if (this.isAlpha(char)) {
        const word = this.readWord();
        this.tokenizeWord(word);
      } else if (this.isDigit(char)) {
        this.#tokens.push({
          type: LiteralTokenType.VALUE,
          value: this.readNumber(),
        });
      } else if (char === '"') {
        this.#tokens.push({
          type: LiteralTokenType.VALUE,
          value: this.readString(),
        });
      } else {
        this.tokenizeSymbol();
      }
    }

    this.#tokens.push({ type: MetaTokenType.EOF });
    return this.#tokens;
  }

  private peek(): string | undefined {
    if (this.pos >= this.src.length) return undefined;
    return this.src[this.pos];
  }

  private advance(): string | undefined {
    if (this.pos >= this.src.length) return undefined;
    return this.src[this.pos++];
  }

  private skipWhitespace() {
    while (true) {
      const ch = this.peek();
      if (ch === undefined) break;

      if (/\s/.test(ch)) {
        this.advance();
      } else if (ch === "/" && this.peekAhead(1) === "/") {
        // Skip comment
        this.advance(); // first /
        this.advance(); // second /
        while (this.peek() !== undefined && this.peek() !== "\n") {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private peekAhead(offset: number): string | undefined {
    const idx = this.pos + offset;
    if (idx >= this.src.length) return undefined;
    return this.src[idx];
  }

  private isAlpha(char: string | undefined): boolean {
    if (char === undefined) return false;
    return /[a-zA-Z_]/.test(char);
  }

  private isDigit(char: string | undefined): boolean {
    if (char === undefined) return false;
    return /[0-9]/.test(char);
  }

  private readWord(): string {
    let result = "";
    while (this.isAlpha(this.peek()) || this.isDigit(this.peek())) {
      const c = this.advance();
      if (c === undefined) break;
      result += c;
    }
    return result;
  }

  private readNumber(): number {
    let result = "";

    while (this.isDigit(this.peek())) {
      const c = this.advance();
      if (c === undefined) break;
      result += c;
    }

    if (this.peek() === ".") {
      result += this.advance();

      while (this.isDigit(this.peek())) {
        const c = this.advance();
        if (c === undefined) break;
        result += c;
      }

      return parseFloat(result);
    }

    return parseInt(result, 10);
  }

  private readString(): string {
    this.advance(); // skip opening "
    let result = "";
    while (true) {
      const ch = this.peek();
      if (ch === undefined) throw new Error("Unterminated string literal");
      if (ch === '"') break;
      result += this.advance();
    }
    this.advance(); // skip closing "
    return result;
  }

  private tokenizeWord(word: string) {
    const token = Tokenizer.keywordMap[word];
    if (token) {
      const properToken: Token = {
        type: token.type,
        ...(token.value !== undefined && { value: token.value }),
      };
      this.#tokens.push(properToken);
    } else {
      this.#tokens.push({ type: VariableTokenType.VARIABLE, value: word });
    }
  }

  private tokenizeSymbol() {
    const c = this.advance();
    if (c === undefined) return;

    if (c === ":" && this.peek() === "=") {
      this.advance();
      this.#tokens.push({ type: SyntaxTokenType.INFER_TYPE });
      return;
    }

    if (c === "<" && this.peek() === "<") {
      this.advance();
      this.#tokens.push({ type: BuiltinFunctionTokenType.LIST_PUSH });
      return;
    }

    if (c === "=" && this.peek() === "=") {
      this.advance();
      this.#tokens.push({ type: OperatorTokenType.EQUAL_EQUAL });
      return;
    }

    if (c === "!" && this.peek() === "=") {
      this.advance();
      this.#tokens.push({ type: OperatorTokenType.NOT_EQUAL });
      return;
    }

    if (c === "<" && this.peek() === "=") {
      this.advance();
      this.#tokens.push({ type: OperatorTokenType.LESS_EQUAL });
      return;
    }

    if (c === ">" && this.peek() === "=") {
      this.advance();
      this.#tokens.push({ type: OperatorTokenType.GREATER_EQUAL });
      return;
    }

    // Single character operators
    const token = Tokenizer.singleCharSymbolMap[c];
    if (token) {
      this.#tokens.push(token);
      return;
    }

    if (c === "^") {
      throw new Error("Exponent operator not implemented");
    }

    throw new Error(`Unexpected symbol '${c}' at position ${this.pos}`);
  }

  private static singleCharSymbolMap: Record<string, Token> = {
    ":": { type: SyntaxTokenType.ASSIGN_COLON },
    "=": { type: SyntaxTokenType.ASSIGN_EQUAL },
    "+": { type: OperatorTokenType.PLUS },
    "-": { type: OperatorTokenType.MINUS },
    "*": { type: OperatorTokenType.MULTIPLY },
    "/": { type: OperatorTokenType.DIVIDE },
    "%": { type: OperatorTokenType.MOD },
    ".": { type: BuiltinFunctionTokenType.DOT },
    ",": { type: SyntaxTokenType.COMMA },
    "{": { type: ScopeTokenType.SCOPE_OPEN },
    "}": { type: ScopeTokenType.SCOPE_END },
    "(": { type: FunctionTokenType.FN_OPEN_PARAM },
    ")": { type: FunctionTokenType.FN_END_PARAM },
    "<": { type: OperatorTokenType.LESS_THAN },
    ">": { type: OperatorTokenType.GREATER_THAN },
    "[": { type: BracketTokenType.BRACKET_OPEN },
    "]": { type: BracketTokenType.BRACKET_CLOSE },
  };

  private static keywordMap: Record<
    string,
    Omit<Token, "value"> & Partial<Token>
  > = {
    fn: { type: FunctionTokenType.FN },
    let: { type: VariableTokenType.LET },
    const: { type: VariableTokenType.CONST },
    if: { type: KeywordTokenType.IF },
    else: { type: KeywordTokenType.ELSE },
    while: { type: KeywordTokenType.WHILE },
    for: { type: KeywordTokenType.FOR },
    of: { type: KeywordTokenType.OF },
    in: { type: KeywordTokenType.IN },
    true: { type: LiteralTokenType.VALUE, value: true },
    false: { type: LiteralTokenType.VALUE, value: false },
    void: { type: LiteralTokenType.TYPE, value: "void" },
    int: { type: LiteralTokenType.TYPE, value: "int" },
    float: { type: LiteralTokenType.TYPE, value: "float" },
    bool: { type: LiteralTokenType.TYPE, value: "bool" },
    list: { type: LiteralTokenType.TYPE, value: "list" },
    return: { type: FunctionTokenType.RETURN },
  };

  get tokens(): Token[] {
    return this.#tokens;
  }
}
