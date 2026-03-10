import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { CronExpressionParser } from 'cron-parser';
import { editFile } from './tools/edit-file.js';
import { globFiles } from './tools/glob-file.js';
import { grepFiles } from './tools/grep-file.js';

const execAsync = promisify(exec);

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

function writeIpcFile(dir: string, data: object): string {
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const filepath = path.join(dir, filename);
    const tempPath = `${filepath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filepath);
    return filename;
}

export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: object;
    };
    execute: (args: any, context: { chatJid: string, groupFolder: string, isMain: boolean }) => Promise<string>;
}

// ==========================================================================================================================================
// ======================= BASH =====================================================================================================
// ==========================================================================================================================================
export const LOCAL_TOOLS: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "Bash",
            description: "Execute a bash command.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string" },
                },
                required: ["command"]
            }
        },
        execute: async (args) => {
            try {
                const { stdout, stderr } = await execAsync(args.command, { cwd: '/workspace/group' });
                return stdout || stderr || "Command executed successfully with no output.";
            } catch (err: any) {
                return `Error: ${err.message}\n${err.stdout || ''}\n${err.stderr || ''}`;
            }
        }
    },
// ==========================================================================================================================================
// ======================= READ FILE =====================================================================================================
// ==========================================================================================================================================
    {
        type: "function",
        function: {
            name: "Read",
            description: "Read a file from the filesystem.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                },
                required: ["path"]
            }
        },
        execute: async (args) => {
            try {
                return fs.readFileSync(args.path, 'utf8');
            } catch (err: any) {
                return `Error: ${err.message}`;
            }
        }
    },
// ==========================================================================================================================================
// ======================= WRITE FILE =====================================================================================================
// ==========================================================================================================================================
    {
        type: "function",
        function: {
            name: "Write",
            description: "Write content to a file.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    content: { type: "string" },
                },
                required: ["path", "content"]
            }
        },
        execute: async (args) => {
            try {
                fs.mkdirSync(path.dirname(args.path), { recursive: true });
                fs.writeFileSync(args.path, args.content);
                return `Successfully wrote to ${args.path}`;
            } catch (err: any) {
                return `Error: ${err.message}`;
            }
        }
    },
// ==========================================================================================================================================
// ======================= EDIT FILE =====================================================================================================
// ==========================================================================================================================================
    {
        type: "function",
        function: {
            name: "Edit",
            description: "Safely edit a file using atomic Multi-Block Search/Replace. You can make multiple changes at once. For each change, provide the exact existing text (search_block) with enough surrounding context lines to make it unique, and the new text (replace_block).",
            parameters: {
                type: "object",
                properties: {
                    path: { 
                        type: "string", 
                        description: "Absolute path to the file (e.g., /workspace/group/file.ts)" 
                    },
                    edits: {
                        type: "array",
                        description: "A list of edits to apply to the file.",
                        items: {
                            type: "object",
                            properties: {
                                search_block: { 
                                    type: "string",
                                    description: "The EXACT text block currently in the file. Must include surrounding context lines to ensure it matches exactly ONE place."
                                },
                                replace_block: { 
                                    type: "string",
                                    description: "The new text block that will replace the search_block."
                                }
                            },
                            required: ["search_block", "replace_block"]
                        }
                    }
                },
                required: ["path", "edits"]
            }
        },
        execute: async (args) => {
            return await editFile(args.path, args.edits);
        }
    },
// ==========================================================================================================================================
// ======================= GLOB FILE =====================================================================================================
// ==========================================================================================================================================
    {
        type: "function",
        function: {
            name: "Glob",
            description: "Search for files by name or pattern within the workspace. Essential for understanding directory structures. Supports standard glob patterns (e.g., '**/*.md', 'src/**/*.ts'). Automatically ignores node_modules, .git, and build folders to keep output clean.",
            parameters: {
                type: "object",
                properties: {
                    pattern: { 
                        type: "string", 
                        description: "The glob pattern to search for. Use '**/*' to list all files in a folder, or '**/*.ts' to find specific extensions." 
                    }
                },
                required: ["pattern"]
            }
        },
        execute: async (args) => {
            return await globFiles(args.pattern);
        }
    },
// ==========================================================================================================================================
// ======================= GREP FILE =====================================================================================================
// ==========================================================================================================================================
    {
        type: "function",
        function: {
            name: "Grep",
            description: "Search for a specific text string or regex pattern INSIDE all files in the workspace. It returns the exact file path, line number, and the line content. Essential for finding where variables, functions, or specific words are used across the project. Automatically ignores binary files and node_modules.",
            parameters: {
                type: "object",
                properties: {
                    query: { 
                        type: "string", 
                        description: "The text string to search for (e.g., 'API_KEY', 'function calculateRSI', 'TODO:')." 
                    }
                },
                required: ["query"]
            }
        },
        execute: async (args) => {
            return await grepFiles(args.query);
        }
    },
// ==========================================================================================================================================
// ======================= SEND MESSAGE =====================================================================================================
// ==========================================================================================================================================

    {
        type: "function",
        function: {
            name: "send_message",
            description: "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages.",
            parameters: {
                type: "object",
                properties: {
                    text: { type: "string", description: "The message text to send" },
                    sender: { type: "string", description: "Your role/identity name. When set, messages appear from a dedicated bot in Telegram." }
                },
                required: ["text"]
            }
        },
        execute: async (args, ctx) => {
            const data: Record<string, string | undefined> = {
                type: 'message',
                chatJid: ctx.chatJid,
                text: args.text,
                sender: args.sender || undefined,
                groupFolder: ctx.groupFolder,
                timestamp: new Date().toISOString(),
            };
            writeIpcFile(MESSAGES_DIR, data);
            return "Message sent.";
        }
    },
// ==========================================================================================================================================
// ======================= SCHEDULE TASK GROUP =====================================================================================================
// ==========================================================================================================================================
    {
        type: "function",
        function: {
            name: "schedule_task",
            description: "Schedule a recurring or one-time task.",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "What the agent should do when the task runs." },
                    schedule_type: { type: "string", enum: ["cron", "interval", "once"] },
                    schedule_value: { type: "string" },
                    context_mode: { type: "string", enum: ["group", "isolated"], description: "default group" },
                    target_group_jid: { type: "string", description: "optional JID of the group to schedule the task for." }
                },
                required: ["prompt", "schedule_type", "schedule_value"]
            }
        },
        execute: async (args, ctx) => {
            if (args.schedule_type === 'cron') {
                try { CronExpressionParser.parse(args.schedule_value); }
                catch { return `Invalid cron: "${args.schedule_value}".`; }
            } else if (args.schedule_type === 'interval') {
                if (isNaN(parseInt(args.schedule_value, 10))) return `Invalid interval: "${args.schedule_value}".`;
            } else if (args.schedule_type === 'once') {
                if (isNaN(new Date(args.schedule_value).getTime())) return `Invalid timestamp: "${args.schedule_value}".`;
            }

            const targetJid = ctx.isMain && args.target_group_jid ? args.target_group_jid : ctx.chatJid;
            const data = {
                type: 'schedule_task',
                prompt: args.prompt,
                schedule_type: args.schedule_type,
                schedule_value: args.schedule_value,
                context_mode: args.context_mode || 'group',
                targetJid,
                createdBy: ctx.groupFolder,
                timestamp: new Date().toISOString(),
            };
            const filename = writeIpcFile(TASKS_DIR, data);
            return `Task scheduled (${filename}): ${args.schedule_type} - ${args.schedule_value}`;
        }
    },
    // ================ List task =====================================================================================================
    {
        type: "function",
        function: {
            name: "list_tasks",
            description: "List all scheduled tasks.",
            parameters: { type: "object", properties: {}, required: [] }
        },
        execute: async (args, ctx) => {
            const tasksFile = path.join(IPC_DIR, 'current_tasks.json');
            try {
                if (!fs.existsSync(tasksFile)) return 'No scheduled tasks found.';
                const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
                const tasks = ctx.isMain ? allTasks : allTasks.filter((t: any) => t.groupFolder === ctx.groupFolder);
                if (tasks.length === 0) return 'No scheduled tasks found.';
                const formatted = tasks.map((t: any) => `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}`).join('\n');
                return `Scheduled tasks:\n${formatted}`;
            } catch (err: any) {
                return `Error reading tasks: ${err.message}`;
            }
        }
    },
    // ================ Cancel task =====================================================================================================
    {
        type: "function",
        function: {
            name: "cancel_task",
            description: "Cancel and delete a scheduled task.",
            parameters: {
                type: "object",
                properties: { task_id: { type: "string" } },
                required: ["task_id"]
            }
        },
        execute: async (args, ctx) => {
            const data = { type: 'cancel_task', taskId: args.task_id, groupFolder: ctx.groupFolder, isMain: ctx.isMain, timestamp: new Date().toISOString() };
            writeIpcFile(TASKS_DIR, data);
            return `Task ${args.task_id} cancellation requested.`;
        }
    }
];
// ==========================================================================================================================================
// ======================= EXECUTE TOOL =====================================================================================================
// ==========================================================================================================================================
export async function executeTool(name: string, args: any, context: { chatJid: string, groupFolder: string, isMain: boolean }): Promise<string> {
    const tool = LOCAL_TOOLS.find(t => t.function.name === name);
    if (!tool) {
        return `Error: Tool ${name} not found.`;
    }
    return await tool.execute(args, context);
}
