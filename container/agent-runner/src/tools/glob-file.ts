import fs from 'fs';
import path from 'path';

export async function globFiles(pattern: string, workspaceDir: string = '/workspace/group'): Promise<string> {
    // const debugLog = `\n--- DEBUG GLOB ---\nPattern: ${pattern}\nWorkspace Dir: ${workspaceDir}\n`;
    // fs.appendFileSync('/workspace/group/debug_glob.txt', debugLog, 'utf8');

    try {
        const defaultIgnores = ['node_modules', '.git', 'dist', 'build', '.next'];

        // Hàm đệ quy quét file siêu tốc bằng Native Node.js
        const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []) => {
            if (!fs.existsSync(dirPath)) return arrayOfFiles;

            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const relativePath = path.relative(workspaceDir, fullPath);

                // Bộ lọc chống tràn rác
                if (defaultIgnores.some(ignored => relativePath.includes(ignored))) {
                    continue;
                }

                if (fs.statSync(fullPath).isDirectory()) {
                    arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
                } else {
                    arrayOfFiles.push(relativePath);
                }
            }
            return arrayOfFiles;
        };

        const allFiles = getAllFiles(workspaceDir);

        // Thuật toán giả lập Glob Pattern Matcher
        let matchedFiles = allFiles;
        if (pattern !== '**/*' && pattern !== '*') {
            if (pattern.startsWith('**/*.')) {
                // Lọc theo đuôi file (VD: **/*.md)
                const ext = pattern.replace('**/*.', '.');
                matchedFiles = allFiles.filter(f => f.endsWith(ext));
            } else {
                // Lọc theo từ khóa (VD: **/*plan*)
                const keyword = pattern.replace(/\*/g, '');
                matchedFiles = allFiles.filter(f => f.includes(keyword));
            }
        }

        if (matchedFiles.length === 0) {
            return `No files found matching pattern: '${pattern}'.`;
        }

        matchedFiles.sort();

        // Cơ chế phòng vệ Context Overflow
        const MAX_FILES = 200;
        if (matchedFiles.length > MAX_FILES) {
            const truncatedList = matchedFiles.slice(0, MAX_FILES).join('\n');
            return `${truncatedList}\n\n... (Warning: Found ${matchedFiles.length} files. Only showing first ${MAX_FILES} to prevent context overflow).`;
        }

        return matchedFiles.join('\n');
    } catch (error: any) {
        return `Error executing search: ${error.message}`;
    }
}