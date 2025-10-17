import {
  BuiltinFunctionTokenType,
  FunctionTokenType,
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
      } else if (char === "[") {
        this.readList();
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
      if (ch === undefined || !/\s/.test(ch)) break;
      this.advance();
    }
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

  private readList() {
    this.advance(); // skip '['
    const values: (number | string)[] = [];
    while (true) {
      this.skipWhitespace();
      const ch = this.peek();
      if (ch === undefined) throw new Error("Unterminated list literal");
      if (ch === "]") break;

      if (this.isDigit(ch)) {
        values.push(this.readNumber());
      } else if (ch === '"') {
        values.push(this.readString());
      } else {
        throw new Error(`Unexpected character in list: '${ch}'`);
      }

      this.skipWhitespace();

      if (this.peek() === ",") {
        this.advance();
      }
    }
    this.advance(); // skip ']'
    this.#tokens.push({ type: LiteralTokenType.VALUE, value: values });
  }

  private tokenizeWord(word: string) {
    const token = Tokenizer.keywordMap[word];
    if (token) {
      this.#tokens.push(token);
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
  };

  private static keywordMap: Record<
    string,
    Omit<Token, "value"> & Partial<Token>
  > = {
    fn: { type: FunctionTokenType.FN },
    let: { type: VariableTokenType.LET },
    const: { type: VariableTokenType.CONST },
    void: { type: LiteralTokenType.TYPE, value: "void" },
    int: { type: LiteralTokenType.TYPE, value: "int" },
    float: { type: LiteralTokenType.TYPE, value: "float" },
    bool: { type: LiteralTokenType.TYPE, value: "bool" },
    list: { type: LiteralTokenType.TYPE, value: "list" },
    return: { type: FunctionTokenType.RETURN },
  };

  get tokens() {
    return this.#tokens;
  }
}
