# VAX MACRO-32 for Visual Studio Code

Syntax coloring, formatting, and snippets for VAX MACRO-32, the assembly
language of the VAX under VMS and OpenVMS. Files ending in `.MAR` (any case)
open as MACRO-32.

## What it colors

The grammar reads a line as MACRO-32 does: labels, then an opcode, then
operands, then a comment. What the opcode is decides how the rest of the line is read.

| Element | Examples |
| --- | --- |
| Labels, global labels, local labels | `LOOP:`  `START::`  `10$:` |
| Instructions (branches, calls, and returns set apart) | `MOVL`  `CALLS`  `BRB`  `RET` |
| Directives (data-storage directives set apart) | `.PSECT`  `.ENTRY`  `.LONG`  `.ASCID` |
| Macro calls and their keyword arguments | `$FAB FNM=<FILE.DAT>` |
| Macro definitions, parameters, defaults, created labels | `.MACRO NAME A,B=1,?LBL` |
| Conditional assembly and its conditions | `.IF NOT_EQUAL, X`  `.IIF DF, SYM, ...` |
| Direct assignments | `SYM = 5`  `GLOBAL == 1`  `. = . + 4` |
| Registers | `R0`–`R11`  `AP`  `FP`  `SP`  `PC` |
| Addressing modes | `#`  `@`  `B^`  `W^`  `L^`  `G^`  `S^#`  `I^#` |
| Numbers and radix operators | `10`  `10.`  `1.5E3`  `^X1F`  `^O17`  `^B101`  `^D9`  `^F2.5`  `^M<R2,R3>` |
| Strings | `.ASCII /text/`  `.ASCIZ "text"`  `.IDENT /V1.0/`  `^A/xy/` |
| `.PSECT` attributes | `PIC`  `NOSHR`  `EXE`  `WRT`  `LONG` |
| Comments and line continuation | `; comment`  `,-` |

MACRO-32 is case-insensitive, and so is the coloring.

### Quotes

MACRO-32 has no quote characters, and the grammar uses none:

- `'` is the macro concatenation operator (`G^SYS$'NAME`, `PREFIX'_'N:`), not
  the start of a string.
- `"` is an ordinary character. It delimits a string only after `.ASCII` and
  its relatives, where *any* printing character but blank, `<`, `;`, or `=`
  can: `.ASCII "it's"`, `.ASCII /a;b/`, `.ASCII !x!`.
- A `;` inside a delimited string, a `^A/.../` operand, a `^%...%` macro
  argument, or `<angle brackets>` is text, not a comment.

## Formatting

**Format Document** (Shift+Alt+F; Ctrl+Shift+I on Linux), **Format
Selection**, and **Format on Save** line each statement's fields up in the
conventional MACRO-32 columns:

```
LABEL:  OPCODE  OPERANDS                ; comment
^ 1     ^ 9     ^ 17                    ^ 41
```

Formatting changes only the blanks between fields. It never changes the case
of anything, or the text of a string, an operand, or a comment. Continuation
lines get their operands in the operand column. Blank lines, comment-only lines, and direct
assignments stay as you wrote them, except that trailing blanks are removed.

The command **MACRO-32: Format File** does the same as Format Document.

| Setting | Default | Meaning |
| --- | --- | --- |
| `macro32.format.opcodeColumn` | 9 | Column of the opcode |
| `macro32.format.operandColumn` | 17 | Column of the operands |
| `macro32.format.commentColumn` | 41 | Column of a statement's comment |
| `macro32.format.useTabs` | `true` | Pad with tabs (8-column stops) rather than spaces |

When a field runs past the next column, the next field follows it after one blank.

MACRO-32 files open with 8-column tabs and tab indentation by default. You can
override this under `[macro32]` in your settings.

## Snippets

| Prefix | Inserts |
| --- | --- |
| `module` | `.TITLE`, `.IDENT`, data and code psects, an entry point, `.END` |
| `entry` | `.ENTRY` with a register mask, and `RET` |
| `jsbroutine` | A JSB routine saving and restoring registers |
| `psect` | `.PSECT` with attribute choices |
| `macro` | `.MACRO` … `.ENDM` |
| `if` | `.IF` … `.ENDC` |
| `irp` | `.IRP` … `.ENDR` |
| `ascid`, `ascic` | A string with a descriptor, a counted string |
| `exit` | `$EXIT_S` |
| `chkstatus` | Exit with R0's status if it's an error |

`.MACRO`/`.ENDM`, `.IF`/`.ENDC`, and the repeat blocks fold.

## Installing

Build the extension and install the package:

```sh
npm install
npx vsce package          # writes macro32-vscode-<version>.vsix
code --install-extension macro32-vscode-*.vsix
```

To install it from inside VS Code, run **Extensions: Install from VSIX…** instead. To try changes without
installing, open this folder in VS Code and press F5.

## Developing

- `syntaxes/macro32.tmLanguage.json` is generated. Edit
  `scripts/build-grammar.js` and run `npm run grammar` to regenerate it.
  Packaging also regenerates it.
- The formatter is `src/format.ts`, plain functions with no VS Code
  dependency. `src/extension.ts` registers it.
- `npm test` formats `test/*.mar`, or the files you name
  (`npm test -- path/*.mar`). It checks that formatting changes nothing but
  blanks and that formatting twice gives the same result as formatting once.
- To see how a line is colored, use **Developer: Inspect Editor Tokens and
  Scopes**.

## License

MIT. See [LICENSE](LICENSE).
