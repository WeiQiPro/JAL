# JAL Interpreter - Rust Implementation Design Document

## 1. Executive Summary

This document outlines the architecture and design decisions for porting the JAL TypeScript interpreter to Rust. The primary goals are:
- Improved performance through Rust's zero-cost abstractions
- Memory safety without garbage collection
- Reference counting garbage collection (Rc/RefCell) for runtime values
- Maintainability through clear module separation

## 2. Project Structure

The Rust project will be organized into distinct modules:

```
src/
├── main.rs          - CLI entry point
├── lib.rs           - Public API exports
├── lexer.rs         - Tokenization (from tokenizer.ts)
├── parser.rs        - AST parsing (from parser.ts)
├── type_checker.rs  - Type validation (from checker.ts)
├── interpreter.rs   - Execution engine (from interpreter.ts)
├── value.rs         - Runtime value representations
├── environment.rs   - Variable scope and storage
├── builtins.rs      - Built-in functions (from lib.ts)
├── ast.rs           - AST node definitions
└── error.rs         - Error types and handling
```

## 3. Memory Management Strategy

### Why Reference Counting?

Rust's ownership model prevents memory leaks by design, but interpreter values need to be shared across function calls, environments, and data structures. Three approaches were considered:

**Option A: Reference Counting (Rc<RefCell<T>>)** ✓ CHOSEN
- Pros: Simple, no GC pauses, predictable, works well for interpreters
- Cons: Slight overhead, cannot handle circular references (unlikely here)
- Best for: Small to medium programs, teaching language

**Option B: Arena Allocation**
- Pros: Very fast, cache-friendly
- Cons: Complex lifetime management, all values must live same duration
- Best for: High-performance systems

**Option C: Tracing GC (gc crate)**
- Pros: Handles circular references, closer to traditional GC
- Cons: Full stop-the-world pauses, overkill for interpreter
- Best for: Large long-running applications

### Reference Counting Implementation

Each runtime value will be wrapped in `Rc<RefCell<T>>`:
- `Rc` provides shared ownership and automatic deallocation when refcount reaches 0
- `RefCell` provides interior mutability for modifying values through shared references
- Borrowing is checked at runtime (will panic on double-mut borrow, but safe)

Example lifetime:
```
1. Value created: Rc::new(RefCell::new(value)) - refcount = 1
2. Stored in environment: refcount = 2
3. Passed to function: refcount = 3
4. Function exits, local ref dropped: refcount = 2
5. Variable deleted: refcount = 1
6. Replaced with new value: refcount = 0, memory freed
```

## 4. Type System Design

### AST Representation

The AST will closely mirror the TypeScript version but use Rust enums:
- Statements: VariableDeclaration, FunctionDeclaration, IfStatement, ReturnStatement, etc.
- Expressions: Literal, Variable, BinaryExpression, FunctionCall
- Types: Int, Float, Bool, String, List, Void

All recursive structures will use `Box<T>` to avoid infinite sizes.

### Type Annotations

Runtime will preserve type information:
- Integer widths: 8, 16, 32, 64 bits
- Float widths: 32, 64 bits
- List element types tracked
- Type mismatches caught at check time, not runtime

## 5. Runtime Value System

### Value Representation

Values will be an enum with variants for each type:
- Null (for void returns)
- Boolean
- Integer (i64 internally)
- Float (f64 internally)
- String
- List (Vec<ValueRef>)
- Function (params, body, closure environment)

Each value variant has appropriate methods:
- `to_bool()` for truthiness in conditions
- `type_name()` for type checking
- `to_string()` for printing

### Shared References

All values are `ValueRef = Rc<RefCell<Value>>` to allow:
- Multiple references (environments, function params, list elements)
- Interior mutability (modifying list contents)
- Automatic cleanup

## 6. Call Stack and Execution Frames

### Why Frames Matter

Traditional interpreters use call stacks with frames because:
- **Debugging**: Stack traces show exact execution path
- **Error context**: Know which function failed and from where
- **Pausable execution**: Can pause/resume at frame boundaries (for debuggers, async, etc.)
- **Better error messages**: Show full call stack on error

### Frame Structure

Each frame represents an active function call and contains:
- Function name
- Parameter bindings (name -> ValueRef)
- Local variables
- Return address (which instruction to execute after return)
- Line number for debugging

```
Frame {
  function_name: String,
  locals: HashMap<String, ValueRef>,
  parent_frame: Option<Box<Frame>>,
  return_address: usize,
  line_number: usize,
}
```

### Call Stack Design

Instead of scope stack, maintain explicit call stack:

```
CallStack {
  frames: Vec<Frame>,
  return_value: Option<ValueRef>,
  should_return: bool,
}
```

Operations:
- `push_frame(name, params)`: Enter new function
- `pop_frame()`: Exit function, restore previous frame
- `current_frame()`: Access active frame for variable access
- `get_stack_trace()`: Print full call stack for errors

### Execution Flow with Frames

```
1. execute main()
   - Create frame: "main"
   - Push to stack
   - Execute statements in frame
   - On function call: push new frame
   - On return: pop frame, continue

2. Inside function call:
   - Create frame: "function_name"
   - Bind parameters in frame
   - Execute body
   - Return pops frame, restores context

3. Error handling:
   - Get full stack trace from frames
   - Print: "Error in foo() called from bar() called from main()"
```

### Memory Model with Frames

Frames replace the scope stack:
- Variables stored directly in frame (not HashMap per scope)
- Block scope creates new sub-frame or HashMap within frame
- Cleaner separation between function boundaries and block boundaries

Alternative: Keep scope stack but also maintain frame stack:
- Frame stack for function boundaries + debugging
- Scope stack within each frame for blocks

This is more complex but more correct.

## 7. Advanced Call Stack Patterns

### Stack Traces for Error Reporting

When an error occurs, build a stack trace:

```
RuntimeError: Division by zero in divide()
  at divide() line 42
  at calculate() line 127
  at main() line 5
```

Frame information enables:
- Line number tracking (if source map maintained)
- Function name in every error
- Full execution path for debugging

### Bytecode vs Tree-Walking

Current design is tree-walking (directly execute AST). With frames, could transition to bytecode:

**Tree-walking + Frames:**
- Simpler to implement (current approach)
- Each frame tracks which AST node to execute next
- Good for learning/teaching

**Bytecode + Frames:**
- Compile AST to bytecode instructions first
- Frames track instruction pointer (program counter)
- Much faster execution
- Required for optimizations (JIT, inlining)

Recommendation: Start with tree-walking + frames, migrate to bytecode later.

### Stack Depth Limits

Prevent stack overflow:
- Set max frame depth (e.g., 10,000)
- Throw error if exceeded
- Prevents infinite recursion from crashing interpreter

```
if self.call_stack.len() > MAX_DEPTH {
    return Err("Stack overflow: maximum call depth exceeded");
}
```

## 8. Execution Model with Frames

## 8. Comparing Scope Stack vs Call Stack Approaches

### Current Implementation (Scope Stack Only)

Your TypeScript interpreter uses a flat scope stack:
- Simple: just a Vec of HashMaps
- Works for current features
- Problem: loses function boundary information
- No stack traces or debugging context

### Call Stack Approach

**Advantages:**
- Stack traces for debugging
- Better error context
- Cleaner separation of concerns
- Foundation for future features (debugging, profiling, async)
- Industry standard (all major interpreters use this)

**Disadvantages:**
- More code initially
- Slightly more memory overhead (frame metadata)
- Need to track return addresses (if bytecode later)

### Hybrid Approach (RECOMMENDED)

Keep call stack for functions + scope stack for blocks:

```
CallStack {
  frames: Vec<Frame>,      // One per function call
}

Frame {
  function_name: String,
  scopes: Vec<Scope>,      // Multiple scopes for nested blocks
  return_address: usize,
}

Scope {
  variables: HashMap<String, RuntimeVariable>,
}
```

This gives you:
- Function debugging info (stack traces)
- Block scope semantics (nested scopes within function)
- Cleaner mental model
- Room to grow

### Migration Strategy

Start simple:
1. Keep current scope stack during porting
2. Add minimal frame tracking (just function name + line number)
3. Build stack traces when errors occur
4. Later: full frame info for debugger/profiler

## 9. Bytecode Representation (Future)

### Why Add Bytecode?

Once frames are in place, bytecode becomes feasible:
- **Performance**: Execute simple instructions vs traversing AST
- **Optimization**: Constant folding, dead code elimination
- **Compilation stage**: Separate concerns (parse -> compile -> execute)

### Simple Instruction Set Example

```
Instruction::Push(ValueRef)
Instruction::Pop
Instruction::LoadVariable(String)
Instruction::StoreVariable(String)
Instruction::BinaryOp(BinaryOp)
Instruction::Call(String, arg_count)
Instruction::Return
Instruction::JumpIfFalse(instruction_offset)
Instruction::Jump(instruction_offset)
```

### Execution Model

Each frame has:
- Instruction pointer (PC)
- Execution loop: fetch -> decode -> execute
- Much like real CPU execution

This is a long-term optimization, not required for MVP.

### When Cleanup Happens

Memory is freed automatically when refcount reaches 0:
- Variable goes out of scope
- Value replaced with new assignment
- List element removed or list deleted
- Function returns and local vars dropped

### Potential Circular References

Unlikely in current language:
- Functions capture closure environment (not circular)
- Lists contain values (no backreferences)
- If future features add object properties, could cause cycles

Mitigation if needed: Use `Weak<T>` for parent references.

### Performance Characteristics

- Clone operation: O(1) atomic increment
- Drop operation: O(1) atomic decrement
- Borrow check at runtime: O(1) but with small overhead
- No GC pauses or collection overhead

## 9. Error Handling

### Error Types

Custom error enum with variants:
- SyntaxError (parse failures)
- TypeError (type checking failures)
- RuntimeError (execution failures)
- UndefinedVariable
- DivisionByZero

### Propagation

Use Rust's `Result<T, E>` type:
- `?` operator for early return on error
- Error messages include context (line numbers when available)
- Panics only for truly unrecoverable situations (e.g., RefCell double-borrow)

## 10. Key Design Differences from TypeScript

### Compilation vs Interpretation
- Rust code is compiled to native binary (fast startup and execution)
- TypeScript is JIT-compiled by V8 (warm-up time)

### Type Safety
- Rust compile-time type checking catches more errors before runtime
- No type coercion (explicit conversions required)

### Memory Model
- Explicit ownership and borrowing (prevents entire classes of bugs)
- Reference counting is deterministic (not stop-the-world GC)

### Performance Tradeoffs
- Rust will be 5-20x faster for compute-heavy code
- Startup overhead negligible for real programs
- More memory per value (refcount overhead) but total less with better GC

## 11. Migration Checklist

### Phase 1: Setup
- [ ] Initialize Cargo project
- [ ] Set up error types and macros
- [ ] Define AST nodes

### Phase 2: Lexer and Parser
- [ ] Port tokenizer (straightforward translation)
- [ ] Port parser (handle Box<T> for recursion)
- [ ] Add tests for each stage

### Phase 3: Core Interpreter
- [ ] Implement Value enum and ValueRef
- [ ] Implement Environment with scope stack
- [ ] Port expression evaluator
- [ ] Port statement executor

### Phase 4: Features
- [ ] Binary operations and comparisons
- [ ] Function calls and recursion
- [ ] If/else branching
- [ ] List operations

### Phase 5: Type Checking
- [ ] Port type checker logic
- [ ] Integrate before interpretation

### Phase 6: Built-ins
- [ ] Implement print, len, type, toString, toNumber
- [ ] Add any additional helpers

### Phase 7: Testing and Polish
- [ ] Write comprehensive test suite
- [ ] Performance benchmarking
- [ ] Error message improvements
- [ ] Documentation

## 12. Future Extensibility

### For Circular References
If needed, replace `Rc<T>` with `Gc<T>` from the `gc` crate (mark-and-sweep GC).

### For Better Performance
Consider arena allocation for hot paths or switch to `bumpalo` allocator.

### For Async Support
Rust's async/await and futures could support concurrent code execution (future feature).

### For REPL
Maintain interpreter state across input lines (already designed for this).

## 13. Success Criteria

- [ ] All TypeScript test cases pass in Rust version
- [ ] Performance improvement of at least 5x over TypeScript
- [ ] Memory usage comparable or better than TypeScript
- [ ] Compile time under 5 seconds
- [ ] Executable size under 10MB (release build)
- [ ] No memory leaks or unsafe code beyond Rc/RefCell requirement