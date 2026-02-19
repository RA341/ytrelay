import {Hono} from 'hono';
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import * as path from 'node:path';
import {authMiddleware} from './middleware';
import {logger} from './logger';
import {initCache, getCachedFile, addFileToCache} from './cache';
import {serveStatic} from 'hono/bun'

const app = new Hono();

app.use('*', authMiddleware);

app.get('/', serveStatic({path: './ui/index.html'}))

app.get('/download', async (c) => {
    const videoUrl = c.req.query('url');
    logger.info('Download endpoint hit', {videoUrl});

    if (!videoUrl) {
        logger.warn('Missing video URL in download request', {ip: c.req.url});
        return c.json({error: 'Missing video URL'}, 400);
    }

    let filePath: string | undefined; // Declare filePath here to be accessible in finally block
    let downloadedFileName: string | undefined; // Store the actual filename for headers and cache

    try {
        const cachedEntry = getCachedFile(videoUrl);
        if (cachedEntry) {
            filePath = cachedEntry.filePath;
            downloadedFileName = cachedEntry.originalFileName;
            logger.info('Serving video from cache', {videoUrl, filePath});

            const fileContent = await fs.readFile(filePath);
            c.header('Content-Disposition', `attachment; filename="${downloadedFileName}"`);
            c.header('Content-Type', 'application/octet-stream');
            return c.body(fileContent);
        }

        const downloadDir = path.join(process.cwd(), 'downloads'); // Temporary download location
        const uniqueId = Date.now().toString();
        const outputTemplate = path.join(downloadDir, `${uniqueId}.%(ext)s`);

        logger.info('Ensuring download directory exists', {downloadDir});
        await fs.mkdir(downloadDir, {recursive: true});

        const commandString = `yt-dlp -o "${outputTemplate}" "${videoUrl}"`;
        logger.info('Executing yt-dlp command', {commandString});

        // Split the command string into command and arguments for spawn
        const parts = commandString.split(' ');
        const commandName = parts[0];
        const args = parts.slice(1).map(arg => {
            // Remove surrounding quotes if present
            if (arg.startsWith('"') && arg.endsWith('"')) {
                return arg.slice(1, -1);
            }
            return arg;
        });

        await new Promise<void>((resolve, reject) => {
            const child = spawn(commandName, args);

            child.stdout.on('data', (data) => {
                logger.info(`yt-dlp stdout: ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                logger.warn(`yt-dlp stderr: ${data.toString().trim()}`);
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    const error = new Error(`yt-dlp process exited with code ${code}`);
                    logger.error(`yt-dlp process failed`, error, {code, commandString});
                    return reject(error);
                }
                logger.info('yt-dlp command executed successfully');
                resolve();
            });

            child.on('error', (err) => {
                logger.error(`Failed to start yt-dlp process`, err, {commandName, args});
                reject(err);
            });
        });

        // Find the newly downloaded file in the temporary directory
        const filesInDownloadDir = await fs.readdir(downloadDir);
        const tempDownloadedFile = filesInDownloadDir.find(file => file.startsWith(uniqueId));

        if (!tempDownloadedFile) {
            logger.error('Failed to find temporary downloaded file after yt-dlp', undefined, {uniqueId, downloadDir});
            return c.json({error: 'Failed to find downloaded file'}, 500);
        }

        const tempFilePath = path.join(downloadDir, tempDownloadedFile);
        logger.info('Temporary downloaded file found', {tempFilePath});

        const addedToCacheEntry = await addFileToCache(videoUrl, tempFilePath, tempDownloadedFile);
        filePath = addedToCacheEntry.filePath; // Now filePath points to the cached version
        downloadedFileName = addedToCacheEntry.originalFileName;

        const fileContent = await fs.readFile(filePath);
        logger.info('File content read, preparing to serve from cache after download', {
            filePath,
            fileSize: fileContent.length
        });

        c.header('Content-Disposition', `attachment; filename="${downloadedFileName}"`);
        c.header('Content-Type', 'application/octet-stream');

        // Clean up the temporary download directory after moving the file to cache
        // Assuming downloadDir is intended only for temporary storage per request
        setTimeout(async () => {
            try {
                await fs.rm(downloadDir, {recursive: true, force: true});
                logger.info(`Cleaned up temporary download directory: ${downloadDir}`);
            } catch (cleanupError) {
                logger.error(`Error cleaning up temporary download directory ${downloadDir}`, cleanupError as Error);
            }
        }, 0);


        return c.body(fileContent);

    } catch (error) {
        logger.error('Download or file serving error', error as Error, {videoUrl});
        return c.json({error: 'Failed to download or serve video'}, 500);
    }
});


async function main() {
    await initCache();

    Bun.serve({
        fetch: app.fetch,
        // 0 = disabled since downloads are long running
        idleTimeout: 0,
        port: 3000,
    });
}

main().then(() => {
    logger.info("Started Server")
})