// Token Types

export enum FunctionTokenType {
  FN = "FN",
  FN_OPEN_PARAM = "FN_OPEN_PARAM",
  FN_END_PARAM = "FN_END_PARAM",
  RETURN = "RETURN",
  FN_ENTRY = "FN_ENTRY",
}

export enum VariableTokenType {
  LET = "LET",
  CONST = "CONST",
  VARIABLE = "VARIABLE",
}

export enum SyntaxTokenType {
  ASSIGN_EQUAL = "ASSIGN_EQUAL",
  ASSIGN_COLON = "ASSIGN_COLON",
  INFER_TYPE = "INFER_TYPE",
  COMMA = "COMMA",
}

export enum ScopeTokenType {
  SCOPE_OPEN = "SCOPE_OPEN",
  SCOPE_END = "SCOPE_END",
}

export enum LiteralTokenType {
  VALUE = "VALUE",
  TYPE = "TYPE",
}

export enum OperatorTokenType {
  PLUS = "PLUS",
  MINUS = "MINUS",
  MULTIPLY = "MULTIPLY",
  DIVIDE = "DIVIDE",
  MOD = "MOD",
}

export enum BuiltinFunctionTokenType {
  LIST_PUSH = "LIST_PUSH",
  DOT = "DOT",
}

export enum MetaTokenType {
  EOF = "EOF",
}

// Combine all token types into one union
export type TokenType =
  | FunctionTokenType
  | VariableTokenType
  | SyntaxTokenType
  | ScopeTokenType
  | LiteralTokenType
  | OperatorTokenType
  | BuiltinFunctionTokenType
  | MetaTokenType;

// Token interface
export interface Token {
  type: TokenType;
  value?: string | number | boolean | null | (string | number)[];
}

// Helper type guards
export function isFunctionToken(t: Token): t is Token & { type: FunctionTokenType } {
  return Object.values(FunctionTokenType).includes(t.type as FunctionTokenType);
}

export function isVariableToken(t: Token): t is Token & { type: VariableTokenType } {
  return Object.values(VariableTokenType).includes(t.type as VariableTokenType);
}

export function isSyntaxToken(t: Token): t is Token & { type: SyntaxTokenType } {
  return Object.values(SyntaxTokenType).includes(t.type as SyntaxTokenType);
}

export function isScopeToken(t: Token): t is Token & { type: ScopeTokenType } {
  return Object.values(ScopeTokenType).includes(t.type as ScopeTokenType);
}

export function isLiteralToken(t: Token): t is Token & { type: LiteralTokenType } {
  return Object.values(LiteralTokenType).includes(t.type as LiteralTokenType);
}

export function isOperatorToken(t: Token): t is Token & { type: OperatorTokenType } {
  return Object.values(OperatorTokenType).includes(t.type as OperatorTokenType);
}

export function isBuiltinFunctionToken(t: Token): t is Token & { type: BuiltinFunctionTokenType } {
  return Object.values(BuiltinFunctionTokenType).includes(t.type as BuiltinFunctionTokenType);
}

// Operator precedence
export const PRECEDENCE: Partial<Record<OperatorTokenType, number>> = {
  [OperatorTokenType.MULTIPLY]: 3,
  [OperatorTokenType.DIVIDE]: 3,
  [OperatorTokenType.MOD]: 3,
  [OperatorTokenType.PLUS]: 2,
  [OperatorTokenType.MINUS]: 2,
};

// === TYPE SYSTEM ===

// Types for integers with specific bit widths
export type IntTypeKind = "int" | "i8" | "i16" | "i32" | "i64";

// Types for floats with specific bit widths
export type FloatTypeKind = "float" | "f32" | "f64";

export type TypeName =
  | IntTypeKind
  | FloatTypeKind
  | "bool"
  | "string"  // char *
  | "list"
  | "void";

// Internal representation of a type annotation
export type TypeAnnotation =
  | { kind: "int"; bits: 8 | 16 | 32 | 64 }
  | { kind: "float"; bits: 32 | 64 }
  | { kind: "bool" }
  | { kind: "string" }
  | { kind: "list"; elementType: TypeAnnotation }
  | { kind: "void" };

// Utility function to map from type string token to internal type annotation
export function mapTypeTokenToAnnotation(typeStr: string): TypeAnnotation {
  switch (typeStr) {
    case "int":
    case "i32":
      return { kind: "int", bits: 32 };
    case "i8":
      return { kind: "int", bits: 8 };
    case "i16":
      return { kind: "int", bits: 16 };
    case "i64":
      return { kind: "int", bits: 64 };
    case "float":
    case "f32":
      return { kind: "float", bits: 32 };
    case "f64":
      return { kind: "float", bits: 64 };
    case "bool":
      return { kind: "bool" };
    case "string":
      return { kind: "string" };
    case "void":
      return { kind: "void" };
    case "list":
      return { kind: "list", elementType: { kind: "void" } }; //update to specific types
    default:
      throw new Error(`Unknown type annotation: ${typeStr}`);
  }
}

// === AST Node Types ===

export interface Literal {
  kind: "Literal";
  value: number | string | boolean | null | (string | number)[];
}

export interface Variable {
  kind: "Variable";
  name: string;
}

export interface BinaryExpression {
  kind: "BinaryExpression";
  operator: OperatorTokenType | string;
  left: Expression;
  right: Expression;
}

export interface CallExpression {
  kind: "CallExpression";
  callee: Expression;      // e.g. variable or member access
  args: Expression[];
}

export interface FunctionCallExpression {
  kind: "FunctionCallExpression";
  callee: Expression;      // usually a Variable (function name)
  arguments: Expression[];
}

export type Expression =
  | Literal
  | Variable
  | BinaryExpression
  | CallExpression
  | FunctionCallExpression;

export interface VariableDeclaration {
  kind: "VariableDeclaration";
  name: string;
  initializer: Expression | null;
  mutable?: boolean;
  typeAnnotation?: TypeAnnotation; // Use detailed type here
}

export interface ExpressionStatement {
  kind: "ExpressionStatement";
  expression: Expression;
}

export interface BlockStatement {
  kind: "BlockStatement";
  body: Statement[];
}

export interface FunctionDeclaration {
  kind: "FunctionDeclaration";
  name: string;
  params: Parameter[];
  body: BlockStatement;
  returnType?: TypeAnnotation; // Use detailed type here
}

export interface ListPushStatement {
  kind: "ListPushStatement";
  target: Expression;
  value: Expression;
}

export interface ReturnStatement {
  kind: "ReturnStatement";
  argument: Expression;
}

export type Statement =
  | VariableDeclaration
  | ExpressionStatement
  | BlockStatement
  | FunctionDeclaration
  | ListPushStatement
  | ReturnStatement;

export interface Parameter {
  name: string;
  type: TypeAnnotation;
}

export type Program = {
  kind: "Program";
  body: Statement[];
};

export type RuntimeValue = number | string | boolean | RuntimeValue[] | null | undefined;

export interface RuntimeVariable {
  value: RuntimeValue;
  mutable: boolean;
}

export interface Environment {
  variables: Map<string, RuntimeVariable>;
  parent: Environment | null;
}

export interface Symbol {
  name: string;
  type: TypeAnnotation;
  mutable: boolean;
}

export interface FunctionSymbol {
  name: string;
  params: Parameter[];
  returnType: TypeAnnotation;
}