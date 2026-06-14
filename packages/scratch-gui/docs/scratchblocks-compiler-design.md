# ScratchBlocks Compiler Design

## Goal

Convert between ScratchBlocks text and Scratch 3 project JSON without silently
changing program meaning or corrupting an existing project.

## Pipeline

1. Normalize harmless formatting differences.
2. Split the response into exact stage and sprite sections.
3. Parse each section with the official `scratchblocks` parser.
4. Convert the parsed AST with a typed block schema.
5. Validate VM block references, parent links, and input types.
6. Replace only validated target programs in a cloned project JSON.
7. Preserve every omitted, unsupported, or invalid target.

## Safety Rules

- Never send partially converted target code to the VM.
- Never connect text or number primitives to Boolean inputs.
- Never remove scripts unless `# ブロックなし` is explicitly present.
- Never replace costumes, sounds, target properties, or project metadata.
- Preserve unknown extension blocks until their schema is implemented.
- Treat parser recovery as a warning, not permission to guess program meaning.

## Typed Schema Requirements

Each supported block definition must specify:

- Official ScratchBlocks ID
- VM opcode
- Block shape: hat, command, reporter, Boolean, C block, or cap
- Ordered ScratchBlocks inputs
- VM input names and accepted shapes
- VM fields and menu shadow opcodes
- ScratchBlocks serialization function

## Completion Criteria

- Every Scratch 3 core block has a typed schema.
- All core blocks pass ScratchBlocks -> JSON -> ScratchBlocks round-trip tests.
- Nested reporters and Boolean expressions preserve their structure.
- Every C block preserves both substacks and parent/next links.
- Variables, lists, and broadcasts reuse existing IDs by name and scope.
- Unsupported extension blocks preserve the existing target and report diagnostics.
- Project validation passes before every `vm.loadProject` call.
- Full GUI dev, dist, and standalone builds pass.

## Current Migration State

- Official Japanese ScratchBlocks AST analysis is active.
- Every current Scratch 3 core command ID is mapped to its VM opcode or to an
  explicitly ignored ScratchBlocks structural marker (`else` and `end`).
- Core blocks in the prompt reference convert in both directions, including
  nested reporters, Boolean blocks, lists, and both branches of if/else.
- Partial or unknown conversion preserves the complete existing target and
  reports a compiler diagnostic to the chat.
- VM project structure, next/parent links, shadows, and Boolean input types are
  validated before loading.
- Existing target properties and assets are preserved; variable and list IDs
  are reused by name.
- Extension and custom procedure blocks are serialized as unknown grey blocks.
  A target containing them is deliberately preserved instead of partially
  replaced.
