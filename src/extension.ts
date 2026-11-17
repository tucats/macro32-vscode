import * as vscode from 'vscode';
import { defaultOptions, formatLine, continues, FormatOptions } from './format';

// The extension's one piece of code: a document formatter for MACRO-32,
// so VS Code's own Format Document (and Format on Save) lines a file's
// fields up at their columns. Syntax coloring needs no code: it is the
// TextMate grammar in syntaxes/.

function options(document: vscode.TextDocument): FormatOptions {
    const c = vscode.workspace.getConfiguration('macro32.format', document);
    return {
        opcodeColumn: c.get('opcodeColumn', defaultOptions.opcodeColumn + 1) - 1,
        operandColumn: c.get('operandColumn', defaultOptions.operandColumn + 1) - 1,
        commentColumn: c.get('commentColumn', defaultOptions.commentColumn + 1) - 1,
        useTabs: c.get('useTabs', defaultOptions.useTabs),
        tabSize: defaultOptions.tabSize,
    };
}

// edits returns an edit for each line in [first, last] that formatting
// changes. Formatting a line depends on whether the one before it was
// continued, so the scan starts at the top of the file.
function edits(document: vscode.TextDocument, first: number, last: number): vscode.TextEdit[] {
    const o = options(document);
    const result: vscode.TextEdit[] = [];
    let continued = false;

    for (let n = 0; n <= last; n++) {
        const line = document.lineAt(n);
        const formatted = formatLine(line.text, continued, o);
        continued = continues(formatted);
        if (n >= first && formatted !== line.text) {
            result.push(vscode.TextEdit.replace(line.range, formatted));
        }
    }
    return result;
}

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { language: 'macro32' };

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(selector, {
            provideDocumentFormattingEdits(document) {
                return edits(document, 0, document.lineCount - 1);
            },
        }),
        vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
            provideDocumentRangeFormattingEdits(document, range) {
                return edits(document, range.start.line, range.end.line);
            },
        }),
        vscode.commands.registerCommand('macro32.format', () =>
            vscode.commands.executeCommand('editor.action.formatDocument')),
    );
}

export function deactivate() {}
