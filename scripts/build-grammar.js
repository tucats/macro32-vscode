// Builds syntaxes/macro32.tmLanguage.json, the TextMate grammar for VAX
// MACRO-32 source files. Run with `npm run grammar` after changing it.
//
// MACRO-32 is a line-oriented language. A statement is
//
//     [label: ...] [opcode [operands]] [; comment]
//
// where a label ends in ":" (or "::" for a global one), the opcode is a
// VAX instruction, a directive (".WORD"), or a macro call ("$EXIT_S"),
// and a direct assignment ("SYM = expr", "SYM == expr") takes the
// place of the opcode. Case doesn't matter. A line ending in "-" is
// continued on the next.
//
// The grammar therefore matches a whole statement at a time: each rule
// below starts at the beginning of a line, reads the labels and the
// opcode, and then colors the operands with rules chosen by the opcode's
// kind, up to the end of the line (or past it, for a continued line).
//
// Things that are NOT strings in MACRO-32, though they look like them:
//   '   the macro argument concatenation operator (PREFIX'NAME)
//   "   an ordinary character (it is only a string delimiter when it
//       follows .ASCII and its relatives, like any other character)
// Strings are the operands of .ASCII, .ASCIZ, .ASCIC, .ASCID, and .IDENT,
// delimited by any printing character (/text/, "text", !text!), and the
// ^A operator's operand (^A/text/).

'use strict';

const fs = require('fs');
const path = require('path');

// The VAX instruction set, as govax's CPU table has it, plus the
// assembler's alternative names for some of them.
const instructions = `
ACBB ACBD ACBF ACBG ACBH ACBL ACBW ADAWI ADDB2 ADDB3 ADDD2 ADDD3 ADDF2 ADDF3
ADDG2 ADDG3 ADDH2 ADDH3 ADDL2 ADDL3 ADDP4 ADDP6 ADDW2 ADDW3 ADWC AOBLEQ AOBLSS
ASHL ASHP ASHQ BBC BBCC BBCCI BBCS BBS BBSC BBSS BBSSI BCC BCS BEQL BEQLU BGEQ
BGEQU BGTR BGTRU BICB2 BICB3 BICL2 BICL3 BICPSW BICW2 BICW3 BISB2 BISB3 BISL2
BISL3 BISPSW BISW2 BISW3 BITB BITL BITW BLBC BLBS BLEQ BLEQU BLSS BLSSU BNEQ
BNEQU BPT BRB BRW BSBB BSBW BUGL BUGW BVC BVS CALLG CALLS CASEB CASEL CASEW CHME
CHMK CHMS CHMU CLRB CLRD CLRF CLRG CLRH CLRL CLRO CLRQ CLRW CMPB CMPC3 CMPC5
CMPD CMPF CMPG CMPH CMPL CMPP3 CMPP4 CMPV CMPW CMPZV CRC CVTBD CVTBF CVTBG CVTBH
CVTBL CVTBW CVTDB CVTDF CVTDH CVTDL CVTDW CVTFB CVTFD CVTFG CVTFH CVTFL CVTFW
CVTGB CVTGF CVTGH CVTGL CVTGW CVTHB CVTHD CVTHF CVTHG CVTHL CVTHW CVTLB CVTLD
CVTLF CVTLG CVTLH CVTLP CVTLW CVTPL CVTPS CVTPT CVTRDL CVTRFL CVTRGL CVTRHL
CVTSP CVTTP CVTWB CVTWD CVTWF CVTWG CVTWH CVTWL DECB DECL DECW DIVB2 DIVB3
DIVD2 DIVD3 DIVF2 DIVF3 DIVG2 DIVG3 DIVH2 DIVH3 DIVL2 DIVL3 DIVP DIVW2 DIVW3
EDITPC EDIV EMODD EMODF EMODG EMODH EMUL EXTV EXTZV FFC FFS HALT INCB INCL INCW
INDEX INSQHI INSQTI INSQUE INSV JBR JMP JSB LDPCTX LOCC MATCHC MCOMB MCOML
MCOMW MFPR MNEGB MNEGD MNEGF MNEGG MNEGH MNEGL MNEGW MOVAB MOVAD MOVAF MOVAG
MOVAH MOVAL MOVAO MOVAQ MOVAW MOVB MOVC3 MOVC5 MOVD MOVF MOVG MOVH MOVL MOVO
MOVP MOVPSL MOVQ MOVTC MOVTUC MOVW MOVZBL MOVZBW MOVZWL MTPR MULB2 MULB3 MULD2
MULD3 MULF2 MULF3 MULG2 MULG3 MULH2 MULH3 MULL2 MULL3 MULP MULW2 MULW3 NOP
POLYD POLYF POLYG POLYH POPR PROBER PROBEW PUSHAB PUSHAD PUSHAF PUSHAG PUSHAH
PUSHAL PUSHAO PUSHAQ PUSHAW PUSHL PUSHR REI REMQHI REMQTI REMQUE RET ROTL RSB
SBWC SCANC SKPC SOBGEQ SOBGTR SPANC SUBB2 SUBB3 SUBD2 SUBD3 SUBF2 SUBF3 SUBG2
SUBG3 SUBH2 SUBH3 SUBL2 SUBL3 SUBP4 SUBP6 SUBW2 SUBW3 SVPCTX TSTB TSTD TSTF
TSTG TSTH TSTL TSTW XFC XORB2 XORB3 XORL2 XORL3 XORW2 XORW3
`.trim().split(/\s+/);

// Longest first, so that an alternation never stops at a prefix (BBS
// before BBSS would leave "S" behind).
const instructionAlternation = [...instructions]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .join('|');

// A symbol's characters. "'" is included where a name may be built by
// concatenation inside a macro body (PREFIX'_'NAME:).
const symChar = "A-Za-z0-9$._";
const name = `[${symChar}']+`;

// The labels that may start a line, as group 1: "A: B:: 10$: ".
const labels = `^[ \\t]*((?:${name}::?[ \\t]*)*)`;

// What may follow an opcode: a blank, a comment, or the end of the line.
const opEnd = `(?=[ \\t]|;|$)`;

// The end of a statement: the end of the line. A continued line's "-"
// opens a region (#continuation) that holds the statement open across
// the line break.
const statementEnd = '$';

// The pieces of an operand field, in the order they're tried.
const operandItems = [
    { include: '#ascii-operator' },
    { include: '#delimited-argument' },
    { include: '#angle-brackets' },
    { include: '#continuation' },
    { include: '#registers' },
    { include: '#mode-prefix' },
    { include: '#radix-numbers' },
    { include: '#numbers' },
    { include: '#local-labels' },
    { include: '#string-operators' },
    { include: '#symbols' },
    { include: '#operators' },
];

const labelCapture = {
    name: 'meta.labels.macro32',
    patterns: [{ include: '#label' }],
};

const grammar = {
    $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'VAX MACRO-32',
    scopeName: 'source.macro32',
    patterns: [
        { include: '#comment' },
        { include: '#assignment' },
        { include: '#string-directive' },
        { include: '#title-directive' },
        { include: '#macro-definition' },
        { include: '#conditional-directive' },
        { include: '#psect-directive' },
        { include: '#directive' },
        { include: '#instruction' },
        { include: '#macro-call' },
        { include: '#labels-only' },
    ],
    repository: {
        comment: {
            match: '(;).*$',
            name: 'comment.line.semicolon.macro32',
            captures: { 1: { name: 'punctuation.definition.comment.macro32' } },
        },

        // A label, inside a statement's label field.
        label: {
            patterns: [
                {
                    // Local labels: 10$: (only valid within a local block).
                    match: `([0-9]+\\$)(::?)`,
                    captures: {
                        1: { name: 'entity.name.label.local.macro32' },
                        2: { name: 'punctuation.separator.label.macro32' },
                    },
                },
                {
                    match: `(${name})(::?)`,
                    captures: {
                        1: { name: 'entity.name.label.macro32' },
                        2: { name: 'punctuation.separator.label.macro32' },
                    },
                },
            ],
        },

        'labels-only': {
            match: `^[ \\t]*((?:${name}::?[ \\t]*)+)`,
            captures: { 1: labelCapture },
        },

        // SYM = expr, SYM == expr (global), SYM =: expr, and . = expr.
        assignment: {
            begin: `${labels}(${name})[ \\t]*(==?:?)`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'variable.other.constant.macro32' },
                3: { name: 'keyword.operator.assignment.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.assignment.macro32',
            patterns: [{ include: '#comment' }, ...operandItems],
        },

        // .ASCII and its relatives, and .IDENT: strings with any delimiter,
        // and <expressions> between them.
        'string-directive': {
            begin: `(?i)${labels}(\\.(?:ASCI[ICZD]|IDENT))${opEnd}`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'storage.type.string.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.directive.macro32',
            patterns: [
                { include: '#comment' },
                { include: '#angle-brackets' },
                { include: '#continuation' },
                {
                    // The delimiter is any printing character but blank,
                    // "<", ";", or "="; the string ends at its next use.
                    begin: '([^\\s<;=])',
                    beginCaptures: { 1: { name: 'punctuation.definition.string.begin.macro32' } },
                    end: '(\\1)|$',
                    endCaptures: { 1: { name: 'punctuation.definition.string.end.macro32' } },
                    name: 'string.quoted.other.macro32',
                },
            ],
        },

        // .TITLE module text, .SUBTITLE text, .SBTTL text: the rest of the
        // line, up to a comment, is text.
        'title-directive': {
            begin: `(?i)${labels}(?:(\\.TITLE)(?:[ \\t]+([^ \\t;]+))?|(\\.(?:SUBTITLE|SBTTL)))${opEnd}`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'keyword.other.directive.macro32' },
                3: { name: 'entity.name.section.macro32' },
                4: { name: 'keyword.other.directive.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.directive.macro32',
            patterns: [
                { include: '#comment' },
                { match: '[^;]+', name: 'string.unquoted.title.macro32' },
            ],
        },

        // .MACRO name args: the name, then parameters with their defaults
        // (A=1) and created labels (?LBL).
        'macro-definition': {
            begin: `(?i)${labels}(\\.MACRO)(?:[ \\t]+(${name}))?${opEnd}`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'keyword.control.macro.macro32' },
                3: { name: 'entity.name.function.macro.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.macro-definition.macro32',
            patterns: [
                { include: '#comment' },
                { include: '#continuation' },
                { match: '=', name: 'keyword.operator.assignment.macro32' },
                {
                    match: `(\\?)?([A-Za-z$_][${symChar}]*)`,
                    captures: {
                        1: { name: 'keyword.operator.created-label.macro32' },
                        2: { name: 'variable.parameter.macro32' },
                    },
                },
                ...operandItems,
            ],
        },

        // .IF condition, ... and .IIF condition, ..., statement: the
        // condition is a keyword.
        'conditional-directive': {
            begin: `(?i)${labels}(\\.IIF|\\.IF)${opEnd}(?:[ \\t]+(EQ|NE|GT|LE|LT|GE|DF|NDF|B|NB|IDN|DIF|EQUAL|NOT_EQUAL|GREATER|LESS_EQUAL|LESS_THAN|GREATER_EQUAL|DEFINED|NOT_DEFINED|BLANK|NOT_BLANK|IDENTICAL|DIFFERENT|ZERO|NOT_ZERO)\\b)?`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'keyword.control.conditional.macro32' },
                3: { name: 'keyword.operator.condition.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.directive.macro32',
            patterns: [
                { include: '#comment' },
                {
                    // .IIF's statement, after the condition and expression.
                    match: '(?<=,)[ \\t]*(\\.[A-Za-z_$][A-Za-z0-9_$]*)',
                    captures: { 1: { patterns: [{ include: '#directive-name' }] } },
                },
                ...operandItems,
            ],
        },

        // .PSECT name, attributes.
        'psect-directive': {
            begin: `(?i)${labels}(\\.PSECT)${opEnd}(?:[ \\t]+(${name}))?`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'keyword.other.directive.macro32' },
                3: { name: 'entity.name.section.psect.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.directive.macro32',
            patterns: [
                { include: '#comment' },
                { include: '#continuation' },
                {
                    match: '(?i)(?<![A-Za-z0-9$._])(?:NO)?(?:PIC|SHR|EXE|RD|WRT|VEC|LIB)(?![A-Za-z0-9$._])|(?<![A-Za-z0-9$._])(?:CON|OVR|REL|ABS|LCL|GBL|BYTE|WORD|LONG|QUAD|OCTA|PAGE)(?![A-Za-z0-9$._])',
                    name: 'constant.language.psect-attribute.macro32',
                },
                ...operandItems,
            ],
        },

        // Every other directive, colored by what it does.
        directive: {
            begin: `${labels}(\\.[A-Za-z_$][A-Za-z0-9_$]*)${opEnd}`,
            beginCaptures: {
                1: labelCapture,
                2: { patterns: [{ include: '#directive-name' }] },
            },
            end: statementEnd,
            name: 'meta.statement.directive.macro32',
            patterns: [{ include: '#comment' }, ...operandItems],
        },

        'directive-name': {
            patterns: [
                {
                    // Directives that store data.
                    match: '(?i)\\.(?:ADDRESS|BLK[ABDFGHLOQW]|BYTE|D_FLOATING|DOUBLE|F_FLOATING|FLOAT|G_FLOATING|H_FLOATING|LONG|MASK|OCTA|PACKED|QUAD|REF[1248]|REF16|SIGNED_BYTE|SIGNED_WORD|WORD)(?![A-Za-z0-9$_])',
                    name: 'storage.type.macro32',
                },
                {
                    // Macros, repeat blocks, and conditional assembly.
                    match: '(?i)\\.(?:ENDM|ENDR|MEXIT|MDELETE|MCALL|IRP|IRPC|REPEAT|REPT|IFF|IFT|IFTF|IF_FALSE|IF_TRUE|IF_TRUE_FALSE|ENDC|END)(?![A-Za-z0-9$_])',
                    name: 'keyword.control.macro32',
                },
                {
                    match: '.+',
                    name: 'keyword.other.directive.macro32',
                },
            ],
        },

        // A VAX instruction; branches, jumps, calls, and returns stand out.
        instruction: {
            begin: `(?i)${labels}(${instructionAlternation})${opEnd}`,
            beginCaptures: {
                1: labelCapture,
                2: { patterns: [{ include: '#instruction-name' }] },
            },
            end: statementEnd,
            name: 'meta.statement.instruction.macro32',
            patterns: [{ include: '#comment' }, ...operandItems],
        },

        'instruction-name': {
            patterns: [
                {
                    match: '(?i)(?<![A-Za-z0-9$_])(?:B(?!I[CST])[A-Z0-9]+|J[A-Z]+|ACB[A-Z]|AOB[A-Z]+|SOB[A-Z]+|CALL[GS]|CASE[BWL]|RET|RSB|REI|CHM[EKSU]|HALT|BPT|XFC)(?![A-Za-z0-9$_])',
                    name: 'keyword.control.flow.instruction.macro32',
                },
                {
                    match: '.+',
                    name: 'keyword.other.instruction.macro32',
                },
            ],
        },

        // Anything else in the opcode field is a macro call ($EXIT_S,
        // $FAB, a macro of one's own). Keyword arguments are NAME=value.
        'macro-call': {
            begin: `${labels}([A-Za-z$_][${symChar}']*)${opEnd}`,
            beginCaptures: {
                1: labelCapture,
                2: { name: 'support.function.macro.macro32' },
            },
            end: statementEnd,
            name: 'meta.statement.macro-call.macro32',
            patterns: [
                { include: '#comment' },
                {
                    match: `(?<![${symChar}'])([A-Za-z$_][${symChar}]*)[ \\t]*(=)`,
                    captures: {
                        1: { name: 'variable.parameter.keyword.macro32' },
                        2: { name: 'keyword.operator.assignment.macro32' },
                    },
                },
                ...operandItems,
            ],
        },

        // A "-" at the end of a line (before any comment) continues the
        // statement on the next line. The region ends at the next line's
        // start, and the statement goes on there.
        continuation: {
            begin: '(-)(?=[ \\t]*(?:;.*)?$)',
            beginCaptures: { 1: { name: 'punctuation.separator.continuation.macro32' } },
            end: '^',
            patterns: [{ include: '#comment' }],
        },

        // ^A/text/: the ASCII value of a string.
        'ascii-operator': {
            match: '(?i)(\\^A)([^\\s;])(.*?)(\\2)',
            captures: {
                1: { name: 'keyword.operator.radix.macro32' },
                2: { name: 'punctuation.definition.string.begin.macro32' },
                3: { name: 'string.quoted.other.macro32' },
                4: { name: 'punctuation.definition.string.end.macro32' },
            },
        },

        // A macro argument written ^%text% (any delimiter but a letter,
        // digit, or "<"), passed as written.
        'delimited-argument': {
            match: '(?<=^|[ \\t,])(\\^)([^\\sA-Za-z0-9<;$._])(.*?)(\\2)',
            captures: {
                1: { name: 'keyword.operator.macro32' },
                2: { name: 'punctuation.definition.string.begin.macro32' },
                3: { name: 'string.unquoted.argument.macro32' },
                4: { name: 'punctuation.definition.string.end.macro32' },
            },
        },

        // <...> groups an expression or a macro argument. A ";" inside
        // the brackets is part of the argument, not a comment.
        'angle-brackets': {
            begin: '<',
            beginCaptures: { 0: { name: 'punctuation.section.angle.begin.macro32' } },
            end: '(>)|(?=$)',
            endCaptures: { 1: { name: 'punctuation.section.angle.end.macro32' } },
            patterns: operandItems.filter((p) => p.include !== '#continuation'),
        },

        registers: {
            match: '(?i)(?<![A-Za-z0-9$._\'])(?:R1[01]|R[0-9]|AP|FP|SP|PC)(?![A-Za-z0-9$._\'])',
            name: 'variable.language.register.macro32',
        },

        // Addressing mode specifiers: B^ W^ L^ (displacement length),
        // G^ (general), I^# (immediate), S^# (short literal).
        'mode-prefix': {
            match: '(?i)(?<![A-Za-z0-9$._\'])[BWLGIS]\\^',
            name: 'storage.modifier.addressing.macro32',
        },

        'radix-numbers': {
            patterns: [
                { match: '(?i)\\^X[0-9A-F]+', name: 'constant.numeric.hex.macro32' },
                { match: '(?i)\\^O[0-7]+', name: 'constant.numeric.octal.macro32' },
                { match: '(?i)\\^B[01]+', name: 'constant.numeric.binary.macro32' },
                { match: '(?i)\\^D[0-9]+', name: 'constant.numeric.decimal.macro32' },
                {
                    match: '(?i)\\^F[0-9]*\\.?[0-9]*(?:E[+-]?[0-9]+)?',
                    name: 'constant.numeric.float.macro32',
                },
                {
                    // ^M<R2,R3> (a register mask) and ^C (complement).
                    match: '(?i)\\^[MC]',
                    name: 'keyword.operator.radix.macro32',
                },
            ],
        },

        numbers: {
            patterns: [
                {
                    // 1.5, 1.5E3, and 10. (a decimal integer).
                    match: '(?i)(?<![A-Za-z0-9$._\'])[0-9]+\\.[0-9]*(?:E[+-]?[0-9]+)?(?![A-Za-z0-9$_\'])',
                    name: 'constant.numeric.float.macro32',
                },
                {
                    match: '(?<![A-Za-z0-9$._\'])[0-9]+(?![A-Za-z0-9$._\'])',
                    name: 'constant.numeric.integer.macro32',
                },
            ],
        },

        'local-labels': {
            match: '(?<![A-Za-z0-9$._\'])[0-9]+\\$(?![A-Za-z0-9$._])',
            name: 'entity.name.label.local.macro32',
        },

        // The macro string operators.
        'string-operators': {
            match: '(?i)%(?:LENGTH|LOCATE|EXTRACT)\\b',
            name: 'support.function.string.macro32',
        },

        // A symbol: one token, so that SYS$1 isn't read as SYS$ and 1.
        symbols: {
            match: `[A-Za-z$._][${symChar}]*`,
            name: 'variable.other.symbol.macro32',
        },

        operators: {
            patterns: [
                { match: '[#@]', name: 'keyword.operator.addressing.macro32' },
                { match: "'", name: 'keyword.operator.concatenation.macro32' },
                { match: '[?\\\\]', name: 'keyword.operator.macro.macro32' },
                { match: '[-+*/&!]', name: 'keyword.operator.arithmetic.macro32' },
                { match: '[()]', name: 'punctuation.section.parens.macro32' },
                { match: ',', name: 'punctuation.separator.comma.macro32' },
            ],
        },
    },
};

const out = path.join(__dirname, '..', 'syntaxes', 'macro32.tmLanguage.json');
fs.writeFileSync(out, JSON.stringify(grammar, null, 2) + '\n');
console.log(`wrote ${out}`);
