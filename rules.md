# Language Grammar Specification

## 1. Lexical Elements

| Token Type  | Description                                                                                                             | Examples                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Identifiers | Start with letter or underscore, then alphanumerics or underscores                                                      | `x`, `my_var`, `_temp`                                                                |
| Keywords    | `let`, `const`, `fn`, `struct`, `enum`, `Modify`, `Static`, `return`, `for`, `while`, `if`, `else`, `break`, `continue` |                                                                                       |
| Literals    | Integers, floats, strings, booleans                                                                                     | `10`, `3.14`, `"Hello"`, `true`, `false`                                              |
| Operators   | Arithmetic, comparison, assignment                                                                                      | `+`, `-`, `*`, `/`, `%`, `**`, `++`, `--`, `:=`, `=`, `==`, `>=`, `<=`, `<`, `>`, `^` |
| Separators  | Parentheses, braces, commas, semicolons                                                                                 | `(`, `)`, `{`, `}`, `[`, `]`, `,`, `;`                                                |
| Comments    | `//` to end of line                                                                                                     | `// This is a comment`                                                                |

---

## 2. Variable Declarations

```ebnf
variable_decl ::= ("let" | "const") identifier [":" type] (":=" | "=") expression ";"
```

* `let` declares mutable variables with automatic or explicit typing.
* `const` declares immutable variables.
* `:=` means automatic initialization with inferred type.
* `=` means explicit initialization with specified type.

**Examples:**

```plaintext
let x := 10;
const pi: f32 = 3.14;
```

---

## 3. Types

* Primitive types: `i32`, `u32`, `f32`, `bool`, `string`
* Pointer types: `*const type`, `*mut type` (mutability controlled by keyword)
* Arrays: `[N]type` fixed-size, `[]type` dynamic size
* Structs: `Struct` or anonymous `{ ... }`

---

## 4. Expressions

* Arithmetic: `+`, `-`, `*`, `/`, `%`, `**` (square), `^` (exponentiation)
* Assignment: `=`, `+=`, `-=`, `*=`, `/=`, `%=`
* Increment/Decrement: `++`, `--`
* Comparison: `==`, `>=`, `<=`, `<`, `>`
* Pointer dereference: `*ptr`
* Address-of operator: `&variable`

---

## 5. Struct Definitions

```ebnf
struct_decl ::= "struct" identifier "{" struct_body "}"
struct_body ::= { member_decl | method_section }
member_decl ::= type identifier ";"
method_section ::= ("Modify" | "Static") method_decl+
method_decl ::= type identifier ":" "fn" "(" [param_list] ")" [";" | block]
param_list ::= param { "," param }
param ::= identifier ":" type
block ::= "{" statement* "}"
```

* `Modify` methods mutate struct instance (`self`).
* `Static` methods are class-level, no `self` parameter.

**Example:**

```plaintext
struct Vec2 {
    f32 x;
    f32 y;

    Modify
        add: fn(self, v2: Vec2);

    Static
        addTwo: fn(v1: Vec2, v2: Vec2);
}
```

---

## 6. Function Definitions

```ebnf
function_decl ::= "fn" identifier "(" [param_list] ")" [":" type] block
```

* Functions can return a type or be `void` (no return).
* `self` parameter is implicit in struct methods.

---

## 7. Control Flow

* `if (condition) { ... } else if (condition) { ... } else { ... }`
* `for (initializer; condition; increment) { ... }`
* `while (condition) { ... }`
* `break;` and `continue;` allowed inside loops

---

## 8. Arrays

* Indexed with zero-based index: `array[index]`
* Array literals: `[1, 2, 3]`
* Array slices: `[]type`

---

## 9. Enums

```ebnf
enum_decl ::= "enum" identifier "{" enum_body "}"
enum_body ::= enum_member { "," enum_member }
enum_member ::= identifier ["=" literal]
```

* Enum members start at 0 by default.
* Members can have explicit integer or string values.

**Example:**

```plaintext
enum State {
    IDLE,
    RUNNING,
    SLEEPING
}

enum StateStrings {
    IDLE = "idle",
    RUN = "run",
    SLEEP = "sleep"
}
```

---

## 10. Comments

* Single line comments: `// comment text`

---

## 11. Sample Statement Syntax

```plaintext
let x := 10;
const y: f32 = 3.14;
let ptr := &x;
let value := *ptr;
*ptr = 20;         // Allowed if ptr is mutable
*cptr = 20;        // Error if cptr is const pointer

for (let i := 0; i < 10; i++) {
    print(i);
}

while (condition) {
    // do stuff
    if (done) { break; }
}

if (x > 10) {
    result = x * x;
} else {
    result = x / 2;
}
```

---

## 12. Operators Summary

| Operator             | Meaning             |
| -------------------- | ------------------- |
| `*=`                 | multiply and assign |
| `/=`                 | divide and assign   |
| `+=`                 | add and assign      |
| `-=`                 | subtract and assign |
| `%`                  | modulo              |
| `**`                 | square (power of 2) |
| `^`                  | exponentiation      |
| `++`                 | increment by one    |
| `--`                 | decrement by one    |
| `==`                 | equal comparison    |
| `>=`, `<=`, `<`, `>` | comparisons         |

---

## 13. Notes

* Variables **cannot be null or undefined**.
* Default zero initialization applies for variables without explicit initialization.
* Strings are UTF-8 byte arrays (`u8` arrays).
* `self` is implicitly available in instance methods declared with `Modify`.
* Mutability is controlled by `let` (mutable) and `const` (immutable).
* Pointers must be declared explicitly with `*const` or `*mut` (or just `*`).
* `Static` keyword groups class-level methods.

---
