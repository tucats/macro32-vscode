// A column formatter for VAX MACRO-32 source.
//
// MACRO-32 source is conventionally laid out in fields at tab stops:
//
//     LABEL:  OPCODE  OPERANDS                ; comment
//     col 1   col 9   col 17                  col 41
//
// formatLine splits one statement into those fields and puts each at
// its column. It only changes the white space between fields: a field's
// own text (strings, macro arguments, expressions) is never altered. A
// line it can't read with confidence is left as written, but for
// trailing blanks.

export interface FormatOptions {
    /** Zero-based column of the opcode field. */
    opcodeColumn: number;
    /** Zero-based column of the operand field. */
    operandColumn: number;
    /** Zero-based column of a statement's comment. */
    commentColumn: number;
    /** Pad with tabs (true) or spaces (false). */
    useTabs: boolean;
    /** The width of a tab stop, for counting columns. */
    tabSize: number;
}

export const defaultOptions: FormatOptions = {
    opcodeColumn: 8,
    operandColumn: 16,
    commentColumn: 40,
    useTabs: true,
    tabSize: 8,
};

/** A statement's fields, as written. */
export interface Fields {
    labels: string;   // "START::" or "A: B:" (blanks between kept)
    opcode: string;
    operands: string;
    comment: string;  // from the ";" on, or ""
}

const symbolChar = /[A-Za-z0-9$._']/;
const stringDirectives = /^\.(ASCI[ICZD]|IDENT)$/i;

/** Returns the visual width of text starting at column 0. */
export function width(text: string, tabSize: number): number {
    let col = 0;
    for (const ch of text) {
        col = ch === '\t' ? (Math.floor(col / tabSize) + 1) * tabSize : col + 1;
    }
    return col;
}

/** Pads text with blanks to reach column target, always adding at least one. */
function padTo(text: string, target: number, o: FormatOptions): string {
    let col = width(text, o.tabSize);
    if (col >= target) {
        return text + (o.useTabs ? '\t' : ' ');
    }
    if (!o.useTabs) {
        return text + ' '.repeat(target - col);
    }
    while (col < target) {
        text += '\t';
        col = (Math.floor(col / o.tabSize) + 1) * o.tabSize;
    }
    return text;
}

/**
 * Finds where a statement's comment starts in rest (the text after the
 * opcode), or -1. A ";" isn't a comment inside <angle brackets>, a
 * ^A/text/ or ^%text% delimited string, or a string directive's
 * delimited strings.
 */
export function commentStart(rest: string, opcode: string): number {
    // A title's text runs to the first ";".
    if (/^\.(TITLE|SUBTITLE|SBTTL)$/i.test(opcode)) {
        return rest.indexOf(';');
    }

    const strings = stringDirectives.test(opcode);
    let angles = 0;

    for (let i = 0; i < rest.length; i++) {
        const ch = rest[i];

        if (ch === ';' && angles === 0) {
            return i;
        }
        if (ch === '<') {
            angles++;
            continue;
        }
        if (ch === '>' && angles > 0) {
            angles--;
            continue;
        }
        if (angles > 0) {
            continue;
        }

        // ^A/text/ and a macro argument's ^%text%.
        if (ch === '^' && i + 2 < rest.length) {
            const next = rest[i + 1];
            let delim = '';
            if ((next === 'A' || next === 'a') && !/\s|;/.test(rest[i + 2])) {
                delim = rest[i + 2];
                i += 2;
            } else if (!/[\sA-Za-z0-9<;$._]/.test(next) && (i === 0 || /[\s,]/.test(rest[i - 1]))) {
                delim = next;
                i += 1;
            }
            if (delim) {
                const end = rest.indexOf(delim, i + 1);
                if (end < 0) {
                    return -1;
                }
                i = end;
            }
            continue;
        }

        // A string directive's strings: any printing character but
        // blank, "<", ";", or "=" delimits one.
        if (strings && !/[\s<;=,]/.test(ch)) {
            const end = rest.indexOf(ch, i + 1);
            if (end < 0) {
                return -1;
            }
            i = end;
        }
    }
    return -1;
}

/**
 * Splits a statement line into its fields, or returns undefined for a
 * line that should be left as written: a blank or comment-only line, or
 * a direct assignment (SYM = expr).
 */
export function splitFields(line: string): Fields | undefined {
    let i = 0;
    const skipBlanks = () => {
        while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
            i++;
        }
    };

    skipBlanks();
    if (i >= line.length || line[i] === ';') {
        return undefined;
    }

    // Labels: name: or name::, any number of them.
    let labels = '';
    for (;;) {
        let j = i;
        while (j < line.length && symbolChar.test(line[j])) {
            j++;
        }
        if (j > i && line[j] === ':') {
            j++;
            if (line[j] === ':') {
                j++;
            }
            labels += (labels ? ' ' : '') + line.slice(i, j);
            i = j;
            skipBlanks();
            continue;
        }
        break;
    }

    if (i >= line.length || line[i] === ';') {
        return { labels, opcode: '', operands: '', comment: line.slice(i) };
    }

    // A direct assignment is laid out by its writer.
    if (/^[A-Za-z0-9$._']+[ \t]*=/.test(line.slice(i))) {
        return undefined;
    }

    let j = i;
    while (j < line.length && !/[\s;]/.test(line[j])) {
        j++;
    }
    const opcode = line.slice(i, j);
    const rest = line.slice(j);
    const semi = commentStart(rest, opcode);
    const operands = (semi < 0 ? rest : rest.slice(0, semi)).trim();
    const comment = semi < 0 ? '' : rest.slice(semi).replace(/\s+$/, '');

    return { labels, opcode, operands, comment };
}

/** Lays out one statement's fields at their columns. */
export function layout(f: Fields, o: FormatOptions): string {
    let text = f.labels;

    if (f.opcode) {
        text = padTo(text, o.opcodeColumn, o) + f.opcode;
        if (f.operands) {
            text = padTo(text, o.operandColumn, o) + f.operands;
        }
    }
    if (f.comment) {
        text = text === '' ? f.comment : padTo(text, o.commentColumn, o) + f.comment;
    }
    return text;
}

/** Formats one line; continued is true if the line before ended in "-". */
export function formatLine(line: string, continued: boolean, o: FormatOptions): string {
    const trimmed = line.replace(/\s+$/, '');

    if (continued) {
        // A continuation line holds more operands: put them in the
        // operand column, and the comment in its column.
        const body = trimmed.trim();
        if (body === '' || body.startsWith(';')) {
            return trimmed;
        }
        const semi = commentStart(body, '');
        const operands = (semi < 0 ? body : body.slice(0, semi)).trim();
        const comment = semi < 0 ? '' : body.slice(semi);
        let text = padTo('', o.operandColumn, o) + operands;
        if (comment) {
            text = padTo(text, o.commentColumn, o) + comment;
        }
        return text;
    }

    const fields = splitFields(trimmed);
    return fields ? layout(fields, o) : trimmed;
}

/** Reports whether a formatted line continues on the next. */
export function continues(line: string): boolean {
    const fields = splitFields(line);
    const code = fields ? fields.operands || fields.opcode : line.replace(/;.*$/, '');
    return /-\s*$/.test(code);
}

/** Formats a whole file's text. */
export function formatText(text: string, o: FormatOptions = defaultOptions): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    let continued = false;

    const out = lines.map((line) => {
        const formatted = formatLine(line, continued, o);
        continued = continues(formatted);
        return formatted;
    });
    return out.join(eol);
}
