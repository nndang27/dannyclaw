import fs from 'fs';
import path from 'path';

export interface EditBlock {
    search_block: string;
    replace_block: string;
}

export async function editFile(filePath: string, edits: EditBlock[]): Promise<string> {

    const debugLog = `\n--- DEBUG EDIT ---\nFile: ${filePath}\nEdits: ${JSON.stringify(edits, null, 2)}\n`;
    fs.appendFileSync('/workspace/group/debug_edit.txt', debugLog, 'utf8');
    try {
        if (!fs.existsSync(filePath)) {
            return `Error: File not found at ${filePath}.`;
        }

        let content = fs.readFileSync(filePath, 'utf8');
        // Normalize line endings to avoid cross-platform matching issues
        content = content.replace(/\r\n/g, '\n');

        // Validation Phase: Check all blocks before applying any
        for (let i = 0; i < edits.length; i++) {
            const search = edits[i].search_block.replace(/\r\n/g, '\n');
            const count = content.split(search).length - 1;

            if (count === 0) {
                return `Error at edit block #${i + 1}: The exact 'search_block' was not found. No changes were made to the file. Please check your exact text and surrounding context.`;
            }
            if (count > 1) {
                return `Error at edit block #${i + 1}: The 'search_block' is ambiguous (found ${count} times). No changes were made. Please include more surrounding lines to make it unique.`;
            }
        }

        // Execution Phase: Apply all replacements
        for (const edit of edits) {
            const search = edit.search_block.replace(/\r\n/g, '\n');
            const replace = edit.replace_block.replace(/\r\n/g, '\n');
            content = content.replace(search, replace);
        }

        fs.writeFileSync(filePath, content, 'utf8');
        return `Successfully applied ${edits.length} edit block(s) to ${filePath}.`;
    } catch (err: any) {
        return `Error applying edit: ${err.message}`;
    }
}