import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ExtractOptions {
    courseId: number;
    packageVersion: number;
    zipBuffer: Buffer;
}

export interface ExtractResult {
    launchUrl: string;
    manifestPath: string | null;
    scormVersion: 'SCORM_12' | 'SCORM_2004';
}

function toForwardSlash(value: string): string {
    return value.replace(/\\/g, '/');
}

async function listFilesRecursive(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listFilesRecursive(fullPath)));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

function detectScormVersion(manifestContent: string): 'SCORM_12' | 'SCORM_2004' {
    const lower = manifestContent.toLowerCase();
    if (lower.includes('2004') || lower.includes('cam 1.3') || lower.includes('adlcp_v1p3')) {
        return 'SCORM_2004';
    }
    return 'SCORM_12';
}

function pickLaunchRelativePath(manifestContent: string): string | null {
    const resourceHrefMatch = manifestContent.match(/<resource[^>]*href=["']([^"']+)["']/i);
    if (resourceHrefMatch?.[1]) {
        return resourceHrefMatch[1];
    }

    return null;
}

async function extractZipArchive(zipPath: string, outputDir: string): Promise<void> {
    if (process.platform === 'win32') {
        await execFileAsync('powershell.exe', [
            '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`,
        ]);
        return;
    }

    await execFileAsync('unzip', ['-o', zipPath, '-d', outputDir]);
}

export async function extractScormZipToPublic(options: ExtractOptions): Promise<ExtractResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nex-scorm-'));
    const zipPath = path.join(tempDir, 'package.zip');
    const targetDir = path.join(process.cwd(), 'public', 'scorm', String(options.courseId), String(options.packageVersion));

    await fs.writeFile(zipPath, options.zipBuffer);
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });

    await extractZipArchive(zipPath, targetDir);

    const files = await listFilesRecursive(targetDir);
    const manifestAbsolute = files.find((file) => path.basename(file).toLowerCase() === 'imsmanifest.xml') || null;

    let launchAbsolute: string | null = null;
    let scormVersion: 'SCORM_12' | 'SCORM_2004' = 'SCORM_12';

    if (manifestAbsolute) {
        const manifest = await fs.readFile(manifestAbsolute, 'utf8');
        scormVersion = detectScormVersion(manifest);

        const launchRelativeFromManifest = pickLaunchRelativePath(manifest);
        if (launchRelativeFromManifest) {
            const manifestDir = path.dirname(manifestAbsolute);
            const candidate = path.resolve(manifestDir, launchRelativeFromManifest);
            try {
                await fs.access(candidate);
                launchAbsolute = candidate;
            } catch {
                launchAbsolute = null;
            }
        }
    }

    if (!launchAbsolute) {
        const launchCandidate = files.find((file) => {
            const base = path.basename(file).toLowerCase();
            return base === 'index_lms.html' || base === 'index.html';
        });
        launchAbsolute = launchCandidate || null;
    }

    if (!launchAbsolute) {
        throw new Error('Could not locate a SCORM launch file (index_lms.html or index.html)');
    }

    const launchRelative = toForwardSlash(path.relative(path.join(process.cwd(), 'public'), launchAbsolute));
    const manifestRelative = manifestAbsolute
        ? toForwardSlash(path.relative(path.join(process.cwd(), 'public'), manifestAbsolute))
        : null;

    await fs.rm(tempDir, { recursive: true, force: true });

    return {
        launchUrl: `/${launchRelative}`,
        manifestPath: manifestRelative ? `/${manifestRelative}` : null,
        scormVersion,
    };
}

