import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';

const execAsync = util.promisify(exec);

export async function grepFiles(query: string, workspaceDir: string = '/workspace/group'): Promise<string> {
    try {
        // PHÉP THUẬT CỦA BẠN: Chuẩn hóa Unicode (NFC) trước khi đưa vào lệnh
        const normalizedQuery = query.normalize('NFC');
        
        // Bảo mật: Escape dấu nháy kép để chống lỗi Bash Injection
        const safeQuery = normalizedQuery.replace(/"/g, '\\"');
        
        // Lệnh grep thần thánh:
        // -r: Quét đệ quy mọi thư mục
        // -n: Trả về chính xác số dòng (Line number)
        // -i: Không phân biệt hoa/thường (Case-insensitive)
        // -I: Bỏ qua hoàn toàn các file nhị phân (ảnh, db) để chống tràn log
        // --exclude-dir: Chặn các ổ rác
        const cmd = `grep -rnI --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build "${safeQuery}" .`;

        const { stdout } = await execAsync(cmd, { cwd: workspaceDir });

        if (!stdout.trim()) {
            return `No matches found for query: '${query}'.`;
        }

        const lines = stdout.trim().split('\n');

        // Cơ chế phòng ngự: Nếu tìm thấy quá 150 dòng, tự động ngắt để bảo vệ não LLM
        const MAX_LINES = 150;
        if (lines.length > MAX_LINES) {
            const truncated = lines.slice(0, MAX_LINES).join('\n');
            return `${truncated}\n\n... (Warning: Found ${lines.length} matches. Only showing first ${MAX_LINES} to prevent context overflow. Please use a more specific search query).`;
        }

        return stdout.trim();
    } catch (error: any) {
        // Đặc thù của grep: Nếu không tìm thấy gì, nó sẽ ném ra mã lỗi code = 1.
        if (error.code === 1) {
            return `No matches found for query: '${query}'.`;
        }
        return `Error executing grep: ${error.message}`;
    }
}